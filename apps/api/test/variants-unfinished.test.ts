import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../src/app.js';
import { openDatabase, type Db } from '../src/db.js';
import { sessionCookie } from './helpers.js';

type App = Awaited<ReturnType<typeof buildApp>>;

describe('warianty kodu, nieukończone wejścia i zmiana nazwy użytkownika', () => {
  let db: Db; let app: App; let athlete: string; let athleteId: number; let other: string;
  beforeEach(async () => {
    db = openDatabase(':memory:');
    app = await buildApp({ db });
    const registered = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { username: 'zawodniczka', password: 'bezpieczne-haslo' } });
    athlete = sessionCookie(registered); athleteId = registered.json().id;
    other = sessionCookie(await app.inject({ method: 'POST', url: '/api/auth/register', payload: { username: 'Łukasz', password: 'bezpieczne-haslo' } }));
  });
  afterEach(async () => { await app.close(); db.close(); });
  const get = (url: string, cookie = athlete) => app.inject({ method: 'GET', url, headers: { cookie } });
  const send = (method: 'POST' | 'PUT', url: string, payload: object, cookie = athlete) => app.inject({ method, url, headers: { cookie }, payload });

  it('ten sam kod z innym (opcjonalnym) opisem to osobny element; ten sam opis — konflikt', async () => {
    const plain = await send('POST', '/api/elements', { code: '40o' });
    const back = await send('POST', '/api/elements', { code: '40o', name: 'z pleców na plecy' });
    expect(plain.statusCode).toBe(201); expect(back.statusCode, back.body).toBe(201);
    expect((await send('POST', '/api/elements', { code: '40o' })).json().message).toMatch(/bez opisu już istnieje/);
    expect((await send('POST', '/api/elements', { code: '40o', name: '  Z PLECÓW NA PLECY ' })).json().message).toMatch(/tym kodzie i opisie/);
    // Renaming into an existing variant is a conflict too; keeping its own description is fine.
    expect((await send('PUT', `/api/elements/${back.json().id}`, { code: '40o', name: '' })).statusCode).toBe(409);
    expect((await send('PUT', `/api/elements/${back.json().id}`, { code: '40o', name: 'z pleców na plecy', favorite: true })).statusCode).toBe(200);
    expect((await get('/api/elements')).json().map((item: any) => [item.code, item.name])).toEqual([['40o', 'z pleców na plecy'], ['40o', null]]);
    // A deleted variant comes back only with its own description.
    await app.inject({ method: 'DELETE', url: `/api/elements/${back.json().id}`, headers: { cookie: athlete } });
    const revived = await send('POST', '/api/elements', { code: '40o', name: 'z pleców na plecy' });
    expect(revived.json().id).toBe(back.json().id);
  });

  it('statystyki i rekordy liczą warianty osobno', async () => {
    const plain = (await send('POST', '/api/elements', { code: '40o' })).json();
    const back = (await send('POST', '/api/elements', { code: '40o', name: 'z pleców na plecy' })).json();
    const element = (item: any, repetitions: number, timeMs?: number) => ({ kind: 'element', sourceElementId: item.id, code: item.code, name: item.name, repetitions, executionTypeName: 'Siatka', ...(timeMs && { timeMs }) });
    await send('POST', '/api/trainings', { date: '2026-11-20', entries: [{ activities: [element(plain, 3), element(back, 2), element(plain, 1, 1500), element(back, 1, 900)] }] });
    const summary = (await get('/api/stats/summary')).json();
    expect(summary.byCode).toEqual({ '40o': 7 });
    expect(summary.byElement.map((item: any) => [item.elementId, item.name, item.count])).toEqual([[plain.id, null, 4], [back.id, 'z pleców na plecy', 3]]);
    const times = (await get('/api/stats/times')).json().items;
    expect(times.map((item: any) => [item.elementId, item.bestMs]).sort()).toEqual([[back.id, 900], [plain.id, 1500]].sort());
    // 1000 ms from the back beats 900 (its own record), not 1500.
    const next = await send('POST', '/api/trainings', { date: '2026-11-21', entries: [{ activities: [element(back, 1, 1000)] }] });
    expect(next.json().newRecords).toMatchObject([{ label: '40o z pleców na plecy', timeMs: 1000, previousMs: 900 }]);
    expect((await get(`/api/stats/summary?elementId=${back.id}`)).json().byElement).toMatchObject([{ elementId: back.id, count: 4 }]);
  });

  it('wejście można oznaczyć jako nieukończone; statystyki je liczą', async () => {
    const [trampoline, dmt] = (await get('/api/apparatus')).json();
    const saved = await send('POST', '/api/trainings', { date: '2026-11-20', entries: [
      { apparatusId: trampoline.id, unfinished: true, activities: [{ kind: 'element', code: '40o', repetitions: 3, executionTypeName: 'Siatka' }] },
      { apparatusId: trampoline.id, activities: [{ kind: 'element', code: '41o', repetitions: 1, executionTypeName: 'Siatka' }] },
      { apparatusId: dmt.id, unfinished: true, activities: [{ kind: 'element', code: '40o', repetitions: 1, executionTypeName: 'Siatka' }] },
    ] });
    expect(saved.json().entries.map((entry: any) => entry.unfinished)).toEqual([true, false, true]);
    expect((await get('/api/stats/summary')).json()).toMatchObject({ entries: 3, unfinishedEntries: 2, totalElements: 5 });
    expect((await get(`/api/stats/summary?apparatusId=${trampoline.id}`)).json()).toMatchObject({ entries: 2, unfinishedEntries: 1 });
  });

  it('zmiana nazwy wymaga hasła, pilnuje unikalności i działa przy logowaniu', async () => {
    expect((await send('PUT', '/api/auth/username', { username: 'Nowa', password: 'zle-haslo-123' })).statusCode).toBe(403);
    expect((await send('PUT', '/api/auth/username', { username: 'łukasz', password: 'bezpieczne-haslo' })).statusCode).toBe(409);
    expect((await send('PUT', '/api/auth/username', { username: 'a', password: 'bezpieczne-haslo' })).statusCode).toBe(400);
    const changed = await send('PUT', '/api/auth/username', { username: 'Ola Nowak', password: 'bezpieczne-haslo' });
    expect(changed.statusCode, changed.body).toBe(200); expect(changed.json()).toMatchObject({ id: athleteId, username: 'Ola Nowak' });
    expect((await get('/api/auth/me')).json().username).toBe('Ola Nowak');
    expect((await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'ola nowak', password: 'bezpieczne-haslo' } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'zawodniczka', password: 'bezpieczne-haslo' } })).statusCode).toBe(401);
    expect((await send('PUT', '/api/auth/username', { username: 'Inna', password: 'bezpieczne-haslo' }, '')).statusCode).toBe(401);
    expect(other).toBeTruthy();
  });
});

describe('migracja v9: warianty kodu i nieukończone wejścia', () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'acronote-v9-')); });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('zdejmuje unikalność kodu z bazy v8 (te same id) i dodaje znacznik nieukończonego wejścia', () => {
    const path = join(dir, 'v8.db');
    let db = openDatabase(path);
    const userId = Number(db.prepare("INSERT INTO users(username,password_hash) VALUES('stary','h')").run().lastInsertRowid);
    // Back to the v8 shape: UNIQUE(user_id, catalog, code), no `unfinished`.
    db.exec(`DROP TABLE elements; DROP INDEX IF EXISTS idx_elements_user_code; DELETE FROM migrations WHERE version=9;
      ALTER TABLE training_entries DROP COLUMN unfinished;
      CREATE TABLE elements (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        code TEXT NOT NULL, name TEXT, favorite INTEGER NOT NULL DEFAULT 0, hidden INTEGER NOT NULL DEFAULT 0, deleted_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, quarter_count INTEGER, salto_count INTEGER, total_twist_halves INTEGER,
        direction TEXT, position_symbol TEXT, catalog TEXT NOT NULL DEFAULT 'trampoline' CHECK(catalog IN ('trampoline','tumbling')),
        UNIQUE(user_id, catalog, code));`);
    db.prepare("INSERT INTO elements(id,user_id,code,name,catalog) VALUES(5,?,'40o','Salto','trampoline'),(8,?,'0o',NULL,'tumbling')").run(userId, userId);
    const trainingId = Number(db.prepare("INSERT INTO trainings(user_id,training_date) VALUES(?,'2026-11-01')").run(userId).lastInsertRowid);
    db.prepare("INSERT INTO training_entries(training_id,position,default_execution_type_name) VALUES(?,0,'Siatka')").run(trainingId);
    db.close();

    db = openDatabase(path);
    try {
      expect((db.prepare('SELECT MAX(version) v FROM migrations').get() as any).v).toBe(9);
      expect(db.prepare('SELECT id,code,name,catalog FROM elements ORDER BY id').all()).toEqual([{ id: 5, code: '40o', name: 'Salto', catalog: 'trampoline' }, { id: 8, code: '0o', name: null, catalog: 'tumbling' }]);
      db.prepare("INSERT INTO elements(user_id,code,name,catalog) VALUES(?,'40o','z pleców','trampoline')").run(userId);
      expect((db.prepare('SELECT unfinished FROM training_entries').get() as any).unfinished).toBe(0);
      expect((db.prepare('PRAGMA integrity_check').get() as any).integrity_check).toBe('ok');
    } finally { db.close(); }
  });
});
