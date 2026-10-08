import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import bcrypt from 'bcryptjs';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../src/app.js';
import { backupDatabase, backupIfDue, listBackups } from '../src/backup.js';
import { openDatabase, seedExecutionTypes, type Db } from '../src/db.js';
import { getTraining } from '../src/training-service.js';
import { importSnapshot } from '../src/import-report.js';
import { buildUserSnapshot } from '../src/bug-reports.js';
import { seedDemoAndAdmin } from '../src/seed.js';

async function login(app: Awaited<ReturnType<typeof buildApp>>, username: string, password: string) {
  const response = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username, password } });
  return { cookie: `acronote_session=${response.cookies[0]!.value}`, response };
}

describe('zgłoszenia błędów', () => {
  let db: Db; let app: Awaited<ReturnType<typeof buildApp>>; let user: string; let admin: string;
  beforeEach(async () => {
    db = openDatabase(':memory:');
    const id = Number(db.prepare("INSERT INTO users(username,password_hash) VALUES('ola',?)").run(await bcrypt.hash('bezpieczne-haslo', 4)).lastInsertRowid); seedExecutionTypes(db, id);
    db.prepare("INSERT INTO users(username,password_hash,role) VALUES('admin',?,'admin')").run(await bcrypt.hash('bezpieczne-admin', 4));
    app = await buildApp({ db });
    user = (await login(app, 'ola', 'bezpieczne-haslo')).cookie; admin = (await login(app, 'admin', 'bezpieczne-admin')).cookie;
    await app.inject({ method: 'POST', url: '/api/elements', headers: { cookie: user }, payload: { code: '40o', name: 'Salto' } });
  });
  afterEach(async () => { await app.close(); db.close(); });

  it('zapisuje zgłoszenie z diagnostyką i migawką danych, bez sekretów', async () => {
    const created = await app.inject({ method: 'POST', url: '/api/bug-reports', headers: { cookie: user, 'user-agent': 'Test/1.0' }, payload: { description: 'Statystyki pokazują zero', expected: 'Liczba elementów', page: '/stats', includeSnapshot: true, diagnostics: { errors: [{ message: 'TypeError' }] } } });
    expect(created.statusCode).toBe(201);
    const mine = (await app.inject({ method: 'GET', url: '/api/bug-reports/mine', headers: { cookie: user } })).json();
    expect(mine).toMatchObject([{ id: created.json().id, status: 'new' }]);
    const detail = await app.inject({ method: 'GET', url: `/api/admin/bug-reports/${created.json().id}`, headers: { cookie: admin } });
    expect(detail.json()).toMatchObject({ username: 'ola', page: '/stats', userAgent: 'Test/1.0', diagnostics: { errors: [{ message: 'TypeError' }] } });
    expect(detail.json().dataSnapshot.elements).toMatchObject([{ code: '40o', name: 'Salto' }]);
    expect(detail.body).not.toContain('password_hash'); expect(detail.body).not.toContain('token_hash'); expect(detail.body).not.toMatch(/\$2[aby]\$/);
  });

  it('odrzuca pusty opis i nie daje zwykłemu użytkownikowi dostępu do listy', async () => {
    expect((await app.inject({ method: 'POST', url: '/api/bug-reports', headers: { cookie: user }, payload: { description: ' ' } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: '/api/bug-reports', payload: { description: 'Bez logowania' } })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/api/admin/bug-reports', headers: { cookie: user } })).statusCode).toBe(403);
  });

  it('pozwala administratorowi rozwiązać i usunąć zgłoszenie', async () => {
    const { id } = (await app.inject({ method: 'POST', url: '/api/bug-reports', headers: { cookie: user }, payload: { description: 'Coś nie działa' } })).json();
    expect((await app.inject({ method: 'PUT', url: `/api/admin/bug-reports/${id}`, headers: { cookie: admin }, payload: { status: 'resolved' } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/admin/bug-reports?status=resolved', headers: { cookie: admin } })).json()).toMatchObject([{ id, status: 'resolved', hasSnapshot: 0 }]);
    expect((await app.inject({ method: 'DELETE', url: `/api/admin/bug-reports/${id}`, headers: { cookie: admin } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/admin/bug-reports', headers: { cookie: admin } })).json()).toEqual([]);
  });
});

describe('tryb publiczny (produkcja)', () => {
  let db: Db; let app: Awaited<ReturnType<typeof buildApp>>;
  beforeEach(async () => {
    db = openDatabase(':memory:');
    db.prepare("INSERT INTO users(username,password_hash,role) VALUES('admin',?,'admin')").run(await bcrypt.hash('bezpieczne-admin', 4));
    app = await buildApp({ db, adminRoutes: false, secureCookies: true, trustProxy: 1 });
  });
  afterEach(async () => { await app.close(); db.close(); });

  it('nie wystawia tras administratora i nie oznacza konta jako admina', async () => {
    const { cookie, response } = await login(app, 'admin', 'bezpieczne-admin');
    expect(response.json().isAdmin).toBe(false);
    expect(response.headers['set-cookie']).toMatch(/Secure/);
    expect((await app.inject({ method: 'GET', url: '/api/admin/users', headers: { cookie } })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/api/admin/bug-reports', headers: { cookie } })).statusCode).toBe(404);
  });

  it('liczy limit logowań osobno dla każdego klienta za proxy', async () => {
    const attempt = (ip: string) => app.inject({ method: 'POST', url: '/api/auth/login', remoteAddress: '10.0.0.1', headers: { 'x-forwarded-for': ip }, payload: { username: 'admin', password: 'zle-haslo-123' } });
    for (let i = 0; i < 15; i++) await attempt('203.0.113.1');
    expect((await attempt('203.0.113.1')).statusCode).toBe(429);
    expect((await attempt('203.0.113.2')).statusCode).toBe(401);
    expect((await attempt('6.6.6.6, 203.0.113.1')).statusCode).toBe(429);
  }, 20000);
});

describe('kopie zapasowe i import zgłoszeń', () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'acronote-test-')); });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('wykonuje spójną kopię przed nową wersją i ogranicza liczbę kopii', () => {
    const path = join(dir, 'app.db'); const db = openDatabase(path); db.prepare("INSERT INTO users(username,password_hash) VALUES('x','h')").run(); db.close();
    const backups = join(dir, 'backups');
    expect(backupIfDue(path, backups, '1.0.0')).toBeTruthy();
    expect(backupIfDue(path, backups, '1.0.0')).toBeNull();
    expect(backupIfDue(path, backups, '1.1.0')).toBeTruthy();
    const copy = openDatabase(join(backups, listBackups(backups)[0]!));
    expect((copy.prepare('SELECT COUNT(*) count FROM users').get() as any).count).toBe(1); copy.close();
    for (let i = 0; i < 5; i++) backupDatabase(path, backups, `v${i}`, 3);
    expect(listBackups(backups)).toHaveLength(3);
    expect(backupDatabase(join(dir, 'missing.db'), backups, 'x')).toBeNull();
    writeFileSync(join(backups, 'other.txt'), 'x'); expect(listBackups(backups)).toHaveLength(3);
  });

  it('odtwarza konto z migawki z tymi samymi treningami', async () => {
    const source = openDatabase(':memory:'); await seedDemoAndAdmin(source, { includeAdmin: false });
    const demoId = (source.prepare("SELECT id FROM users WHERE username='demo'").get() as any).id;
    const snapshot = JSON.parse(JSON.stringify(buildUserSnapshot(source, demoId)));
    const target = openDatabase(':memory:');
    const { userId, username } = await importSnapshot(target, snapshot, 'zgloszenie-7');
    expect(username).toBe('zgloszenie-7');
    const strip = (training: any) => JSON.parse(JSON.stringify(training, (key, value) => ['id', 'executionTypeId', 'defaultExecutionTypeId', 'sourceElementId', 'sourceRoutineId'].includes(key) ? undefined : value));
    const ids = (db: Db, id: number) => (db.prepare('SELECT id FROM trainings WHERE user_id=? ORDER BY training_date,id').all(id) as any[]).map(row => strip(getTraining(db, id, row.id)));
    expect(ids(target, userId)).toEqual(ids(source, demoId));
    expect((target.prepare('SELECT COUNT(*) count FROM elements WHERE user_id=?').get(userId) as any).count).toBe(30);
    expect((await importSnapshot(target, snapshot, 'zgloszenie-7')).username).toBe('zgloszenie-7-2');
    await expect(importSnapshot(target, { format: 'x' }, 'y')).rejects.toThrow();
    source.close(); target.close();
  }, 20000);
});
