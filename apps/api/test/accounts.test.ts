import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import bcrypt from 'bcryptjs';
import { buildApp } from '../src/app.js';
import { openDatabase, seedExecutionTypes, type Db } from '../src/db.js';

type App = Awaited<ReturnType<typeof buildApp>>;
const json = (cookie?: string) => cookie ? { cookie } : {};
const cookieOf = (response: { cookies: { name: string; value: string }[] }) => {
  const session = response.cookies.find(c => c.name === 'acronote_session');
  return session ? `acronote_session=${session.value}` : '';
};

describe('konta, hasła i reset przez administratora', () => {
  let db: Db; let app: App; let admin: string;
  beforeEach(async () => {
    db = openDatabase(':memory:');
    db.prepare("INSERT INTO users(username,password_hash,role) VALUES('admin',?,'admin')").run(await bcrypt.hash('haslo-admina', 4));
    app = await buildApp({ db });
    admin = cookieOf(await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'admin', password: 'haslo-admina' } }));
  });
  afterEach(async () => { await app.close(); db.close(); });
  const register = (username: string, password: string) => app.inject({ method: 'POST', url: '/api/auth/register', payload: { username, password } });
  const login = (username: string, password: string) => app.inject({ method: 'POST', url: '/api/auth/login', payload: { username, password } });

  it('wymaga tylko 8 znaków hasła, bez reguł składu', async () => {
    const short = await register('Ola', 'abc1234');
    expect(short.statusCode).toBe(400); expect(short.json().message).toBe('Hasło musi mieć co najmniej 8 znaków.');
    expect((await register('Ola', 'abcdefgh')).statusCode).toBe(201);
  });

  it('nie pozwala założyć drugiego konta różniącego się tylko wielkością liter, także polskich', async () => {
    expect((await register('Łukasz Kowalski', 'dowolne-haslo')).statusCode).toBe(201);
    expect((await register('łukasz kowalski', 'inne-haslo')).statusCode).toBe(409);
    expect((await register('ŁUKASZ  KOWALSKI', 'inne-haslo')).statusCode).toBe(409);
    expect((await login('łukasz KOWALSKI', 'dowolne-haslo')).statusCode).toBe(200);
  });

  it('przyjmuje prośbę o reset bez ujawniania, czy konto istnieje, i nie częściej niż raz na dobę', async () => {
    await register('Maria Nowak', 'dowolne-haslo');
    const known = await app.inject({ method: 'POST', url: '/api/auth/password-reset-requests', payload: { username: 'maria nowak', message: 'Telefon 600 000 000' } });
    const unknown = await app.inject({ method: 'POST', url: '/api/auth/password-reset-requests', payload: { username: 'Nie Ma Takiego' } });
    expect(known.statusCode).toBe(202); expect(unknown.statusCode).toBe(202); expect(unknown.json().message).toBe(known.json().message);
    await app.inject({ method: 'POST', url: '/api/auth/password-reset-requests', payload: { username: 'Maria Nowak' } });
    const list = (await app.inject({ method: 'GET', url: '/api/admin/password-reset-requests', headers: json(admin) })).json();
    expect(list).toHaveLength(1); expect(list[0]).toMatchObject({ username: 'Maria Nowak', message: 'Telefon 600 000 000', status: 'pending' });
    const users = (await app.inject({ method: 'GET', url: '/api/admin/users', headers: json(admin) })).json();
    expect(users.find((u: any) => u.username === 'Maria Nowak').pendingResetRequests).toBe(1);
  });

  it('kod od administratora pozwala tylko ustawić nowe hasło, a potem przestaje działać', async () => {
    const { id } = (await register('Jan Kowal', 'stare-haslo')).json();
    await app.inject({ method: 'POST', url: '/api/auth/password-reset-requests', payload: { username: 'Jan Kowal' } });
    const issued = await app.inject({ method: 'POST', url: `/api/admin/users/${id}/reset-code`, headers: json(admin) });
    expect(issued.statusCode).toBe(200); const { code } = issued.json(); expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(issued.body).not.toMatch(/\$2[aby]\$/);
    expect((await app.inject({ method: 'GET', url: '/api/admin/password-reset-requests', headers: json(admin) })).json()).toEqual([]);

    const withCode = await login('jan kowal', code.toLowerCase().replace('-', ' '));
    expect(withCode.statusCode).toBe(200); expect(withCode.json().mustChangePassword).toBe(true);
    const restricted = cookieOf(withCode);
    const blocked = await app.inject({ method: 'GET', url: '/api/elements', headers: json(restricted) });
    expect(blocked.statusCode).toBe(403); expect(blocked.json().code).toBe('PASSWORD_CHANGE_REQUIRED');
    expect((await app.inject({ method: 'GET', url: '/api/auth/me', headers: json(restricted) })).json().mustChangePassword).toBe(true);

    const changed = await app.inject({ method: 'PUT', url: '/api/auth/password/new', headers: json(restricted), payload: { newPassword: 'nowe-haslo' } });
    expect(changed.statusCode).toBe(200); expect(changed.json().mustChangePassword).toBe(false);
    expect((await app.inject({ method: 'GET', url: '/api/elements', headers: json(cookieOf(changed)) })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/elements', headers: json(restricted) })).statusCode).toBe(401);
    expect((await login('Jan Kowal', code)).statusCode).toBe(401);
    expect((await login('Jan Kowal', 'stare-haslo')).statusCode).toBe(401);
    expect((await login('Jan Kowal', 'nowe-haslo')).statusCode).toBe(200);
  });

  it('odrzuca wygasły kod czytelnym komunikatem', async () => {
    const { id } = (await register('Ewa', 'dowolne-haslo')).json();
    const { code } = (await app.inject({ method: 'POST', url: `/api/admin/users/${id}/reset-code`, headers: json(admin) })).json();
    db.prepare("UPDATE users SET reset_code_expires_at=datetime('now','-1 minute') WHERE id=?").run(id);
    const response = await login('Ewa', code);
    expect(response.statusCode).toBe(401); expect(response.json().message).toContain('wygasł');
  });

  it('pozwala administratorowi wejść na konto użytkownika i wrócić do swojego', async () => {
    const { id } = (await register('Kasia', 'dowolne-haslo')).json();
    const opened = await app.inject({ method: 'POST', url: `/api/admin/users/${id}/impersonate`, headers: json(admin) });
    expect(opened.statusCode).toBe(200);
    const asUser = `${cookieOf(opened)}; acronote_admin_return=${admin.split('=')[1]}`;
    expect((await app.inject({ method: 'GET', url: '/api/auth/me', headers: json(asUser) })).json()).toMatchObject({ username: 'Kasia', isAdmin: false, impersonatedBy: 'admin' });
    expect((await app.inject({ method: 'POST', url: '/api/elements', headers: json(asUser), payload: { code: '40o' } })).statusCode).toBe(201);
    expect(db.prepare('SELECT COUNT(*) count FROM elements WHERE user_id=?').get(id)).toEqual({ count: 1 });
    const ended = await app.inject({ method: 'POST', url: '/api/auth/impersonation/end', headers: json(asUser) });
    expect(ended.json()).toMatchObject({ ok: true, restored: true });
    expect((await app.inject({ method: 'GET', url: '/api/auth/me', headers: json(cookieOf(ended)) })).json()).toMatchObject({ username: 'admin', isAdmin: true });
    expect((await app.inject({ method: 'GET', url: '/api/auth/me', headers: json(cookieOf(opened)) })).statusCode).toBe(401);
  });

  it('konto założone przez administratora dostaje kod, a hasło ustawia sam użytkownik', async () => {
    const created = await app.inject({ method: 'POST', url: '/api/admin/users', headers: json(admin), payload: { username: 'Zofia Wiśniewska' } });
    expect(created.statusCode).toBe(201); const { resetCode } = created.json(); expect(resetCode.code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    const first = await login('zofia wiśniewska', resetCode.code);
    expect(first.json().mustChangePassword).toBe(true);
    expect((await app.inject({ method: 'PUT', url: '/api/auth/password/new', headers: json(cookieOf(first)), payload: { newPassword: 'moje-haslo' } })).statusCode).toBe(200);
    expect((await login('Zofia Wiśniewska', 'moje-haslo')).statusCode).toBe(200);
  });

  it('zwykły użytkownik nie wygeneruje kodu ani nie wejdzie na cudze konto', async () => {
    const a = cookieOf(await register('Ala', 'dowolne-haslo'));
    const { id } = (await register('Bartek', 'dowolne-haslo')).json();
    expect((await app.inject({ method: 'POST', url: `/api/admin/users/${id}/reset-code`, headers: json(a) })).statusCode).toBe(403);
    expect((await app.inject({ method: 'POST', url: `/api/admin/users/${id}/impersonate`, headers: json(a) })).statusCode).toBe(403);
  });
});

describe('port publiczny bez funkcji administratora', () => {
  it('przyjmuje prośby o reset, ale nie ma tras kodów ani wchodzenia na konta', async () => {
    const db = openDatabase(':memory:');
    const id = Number(db.prepare("INSERT INTO users(username,password_hash) VALUES('u',?)").run(await bcrypt.hash('dowolne-haslo', 4)).lastInsertRowid); seedExecutionTypes(db, id);
    const app = await buildApp({ db, adminRoutes: false });
    expect((await app.inject({ method: 'POST', url: '/api/auth/password-reset-requests', payload: { username: 'u' } })).statusCode).toBe(202);
    expect((await app.inject({ method: 'POST', url: `/api/admin/users/${id}/reset-code` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'POST', url: '/api/auth/impersonation/end' })).statusCode).toBe(404);
    await app.close(); db.close();
  });
});
