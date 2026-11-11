import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { openDatabase, type Db } from '../src/db.js';
import { currentStep, totpAt } from '../src/totp.js';
import { insertAdmin, loginAdmin, sessionCookie, TEST_TOTP_SECRET } from './helpers.js';

type App = Awaited<ReturnType<typeof buildApp>>;
const headers = (cookie?: string) => cookie ? { cookie } : {};
const resetCookie = (response: { cookies: { name: string; value: string }[] }) => {
  const cookie = response.cookies.find(c => c.name === 'acronote_reset');
  return cookie ? `acronote_reset=${cookie.value}` : '';
};

describe('konta, hasła i reset zatwierdzany przez administratora', () => {
  let db: Db; let app: App; let admin: string;
  beforeEach(async () => {
    db = openDatabase(':memory:');
    await insertAdmin(db, 'admin', 'haslo-admina');
    app = await buildApp({ db });
    admin = await loginAdmin(app, 'admin', 'haslo-admina');
  });
  afterEach(async () => { await app.close(); db.close(); });
  const register = (username: string, password: string) => app.inject({ method: 'POST', url: '/api/auth/register', payload: { username, password } });
  const login = (username: string, password: string) => app.inject({ method: 'POST', url: '/api/auth/login', payload: { username, password } });
  const requestReset = (username: string, cookie?: string) => app.inject({ method: 'POST', url: '/api/auth/password-reset', headers: headers(cookie), payload: { username, message: 'tel. 600 000 000' } });

  it('wymaga tylko 8 znaków hasła, bez reguł składu', async () => {
    const short = await register('Ola', 'abc1234');
    expect(short.statusCode).toBe(400); expect(short.json().message).toBe('Hasło musi mieć co najmniej 8 znaków.');
    expect((await register('Ola', 'abcdefgh')).statusCode).toBe(201);
  });

  it('nie rozróżnia wielkości liter w nazwie, także polskich', async () => {
    expect((await register('Łukasz Wójcik', 'bezpieczne-haslo')).statusCode).toBe(201);
    expect((await register('łukasz wójcik', 'inne-haslo-123')).statusCode).toBe(409);
    expect((await login('ŁUKASZ WÓJCIK', 'bezpieczne-haslo')).statusCode).toBe(200);
  });

  it('po zatwierdzeniu tylko urządzenie, które wysłało prośbę, może ustawić nowe hasło', async () => {
    await register('Kasia', 'stare-haslo-1');
    const oldSession = sessionCookie(await login('Kasia', 'stare-haslo-1'));
    const sent = await requestReset('kasia');
    expect(sent.statusCode).toBe(201);
    const device = resetCookie(sent);
    expect(device).not.toBe('');
    const { requestNumber } = sent.json();
    expect(requestNumber).toMatch(/^\d{4}$/);
    expect(sent.json()).toMatchObject({ status: 'pending', username: 'Kasia' });

    // Before approval nothing can be changed.
    expect((await app.inject({ method: 'POST', url: '/api/auth/password-reset/complete', headers: headers(device), payload: { newPassword: 'nowe-haslo-1' } })).statusCode).toBe(403);
    const summary = (await app.inject({ method: 'GET', url: '/api/admin/summary', headers: headers(admin) })).json();
    expect(summary.pendingResets).toBe(1);
    const [pending] = (await app.inject({ method: 'GET', url: '/api/admin/password-resets', headers: headers(admin) })).json();
    expect(pending).toMatchObject({ username: 'Kasia', requestNumber, status: 'pending', message: 'tel. 600 000 000' });
    expect((await app.inject({ method: 'POST', url: `/api/admin/password-resets/${pending.id}/approve`, headers: headers(admin) })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/auth/password-reset', headers: headers(device) })).json()).toMatchObject({ status: 'approved', requestNumber });

    // Another browser (no request cookie) cannot use the approval.
    expect((await app.inject({ method: 'POST', url: '/api/auth/password-reset/complete', payload: { newPassword: 'cudze-haslo-1' } })).statusCode).toBe(403);
    const short = await app.inject({ method: 'POST', url: '/api/auth/password-reset/complete', headers: headers(device), payload: { newPassword: 'krotkie' } });
    expect(short.statusCode).toBe(400);
    const done = await app.inject({ method: 'POST', url: '/api/auth/password-reset/complete', headers: headers(device), payload: { newPassword: 'nowe-haslo-1' } });
    expect(done.statusCode).toBe(200);
    expect(done.json()).toMatchObject({ username: 'Kasia', mfaRequired: false });
    expect((await app.inject({ method: 'GET', url: '/api/auth/me', headers: headers(sessionCookie(done)) })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/auth/me', headers: headers(oldSession) })).statusCode).toBe(401);
    expect((await login('Kasia', 'stare-haslo-1')).statusCode).toBe(401);
    expect((await login('Kasia', 'nowe-haslo-1')).statusCode).toBe(200);
    // The approval works only once.
    expect((await app.inject({ method: 'POST', url: '/api/auth/password-reset/complete', headers: headers(device), payload: { newPassword: 'trzecie-haslo' } })).statusCode).toBe(403);
  });

  it('przyjmuje jedną aktywną prośbę na konto i nową dopiero po odrzuceniu', async () => {
    await register('Kasia', 'stare-haslo-1');
    const first = await requestReset('Kasia');
    // The same device just sees its request again.
    expect((await requestReset('Kasia', resetCookie(first))).json()).toMatchObject({ status: 'pending', requestNumber: first.json().requestNumber });
    const other = await requestReset('Kasia');
    expect(other.statusCode).toBe(409);
    const [row] = (await app.inject({ method: 'GET', url: '/api/admin/password-resets', headers: headers(admin) })).json();
    expect(row.repeatCount).toBe(1);
    expect((await app.inject({ method: 'POST', url: `/api/admin/password-resets/${row.id}/reject`, headers: headers(admin) })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/auth/password-reset', headers: headers(resetCookie(first)) })).json().status).toBe('rejected');
    expect((await requestReset('Kasia')).statusCode).toBe(201);
    expect((await requestReset('Nieistniejące konto')).statusCode).toBe(404);
  });

  it('wygasa niezatwierdzoną prośbę i zatwierdzenie po czasie', async () => {
    await register('Kasia', 'stare-haslo-1');
    const sent = await requestReset('Kasia');
    db.prepare("UPDATE password_resets SET expires_at=datetime('now','-1 minute')").run();
    expect((await app.inject({ method: 'GET', url: '/api/auth/password-reset', headers: headers(resetCookie(sent)) })).json().status).toBe('expired');
    const [row] = (await app.inject({ method: 'GET', url: '/api/admin/password-resets?status=all', headers: headers(admin) })).json();
    expect((await app.inject({ method: 'POST', url: `/api/admin/password-resets/${row.id}/approve`, headers: headers(admin) })).statusCode).toBe(404);
    const again = await requestReset('Kasia');
    expect(again.statusCode).toBe(201);
    const [fresh] = (await app.inject({ method: 'GET', url: '/api/admin/password-resets', headers: headers(admin) })).json();
    await app.inject({ method: 'POST', url: `/api/admin/password-resets/${fresh.id}/approve`, headers: headers(admin) });
    db.prepare("UPDATE password_resets SET approval_expires_at=datetime('now','-1 minute') WHERE id=?").run(fresh.id);
    expect((await app.inject({ method: 'POST', url: '/api/auth/password-reset/complete', headers: headers(resetCookie(again)), payload: { newPassword: 'nowe-haslo-1' } })).statusCode).toBe(403);
  });

  it('pozwala użytkownikowi anulować własną prośbę', async () => {
    await register('Kasia', 'stare-haslo-1');
    const sent = await requestReset('Kasia');
    const cancelled = await app.inject({ method: 'DELETE', url: '/api/auth/password-reset', headers: headers(resetCookie(sent)) });
    expect(cancelled.statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/admin/summary', headers: headers(admin) })).json().pendingResets).toBe(0);
    expect((await requestReset('Kasia')).statusCode).toBe(201);
  });

  it('nie ma już wejścia na konto, kodów resetu ani zakładania kont przez administratora', async () => {
    await register('Kasia', 'stare-haslo-1');
    const id = (db.prepare("SELECT id FROM users WHERE username='Kasia'").get() as { id: number }).id;
    expect((await app.inject({ method: 'POST', url: `/api/admin/users/${id}/impersonate`, headers: headers(admin) })).statusCode).toBe(404);
    expect((await app.inject({ method: 'POST', url: `/api/admin/users/${id}/reset-code`, headers: headers(admin) })).statusCode).toBe(404);
    expect((await app.inject({ method: 'POST', url: '/api/admin/users', headers: headers(admin), payload: { username: 'Nowy' } })).statusCode).toBe(404);
    expect((await app.inject({ method: 'PUT', url: `/api/admin/users/${id}/reset-password`, headers: headers(admin), payload: { newPassword: 'haslo-od-admina' } })).statusCode).toBe(404);
  });

  it('zwykły użytkownik nie ma dostępu do próśb i podsumowania administratora', async () => {
    await register('Kasia', 'stare-haslo-1');
    const user = sessionCookie(await login('Kasia', 'stare-haslo-1'));
    expect((await app.inject({ method: 'GET', url: '/api/admin/password-resets', headers: headers(user) })).statusCode).toBe(403);
    expect((await app.inject({ method: 'GET', url: '/api/admin/summary', headers: headers(user) })).statusCode).toBe(403);
    expect((await app.inject({ method: 'POST', url: '/api/admin/password-resets/1/approve', headers: headers(user) })).statusCode).toBe(403);
  });
});

describe('weryfikacja dwuetapowa administratora', () => {
  let db: Db; let app: App;
  beforeEach(async () => { db = openDatabase(':memory:'); app = await buildApp({ db }); });
  afterEach(async () => { await app.close(); db.close(); });
  const login = (username: string, password: string) => app.inject({ method: 'POST', url: '/api/auth/login', payload: { username, password } });
  const verify = (cookie: string, code: string) => app.inject({ method: 'POST', url: '/api/auth/2fa/verify', headers: { cookie }, payload: { code } });

  it('po haśle wpuszcza tylko do wpisania kodu, a kod można użyć raz', async () => {
    await insertAdmin(db, 'admin', 'haslo-admina');
    const first = await login('admin', 'haslo-admina');
    expect(first.json()).toMatchObject({ mfaRequired: true, isAdmin: true });
    const pending = sessionCookie(first);
    expect((await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: pending } })).json().mfaRequired).toBe(true);
    expect((await app.inject({ method: 'GET', url: '/api/trainings', headers: { cookie: pending } })).statusCode).toBe(403);
    expect((await app.inject({ method: 'GET', url: '/api/admin/users', headers: { cookie: pending } })).statusCode).toBe(403);
    expect((await verify(pending, '000000')).statusCode).toBe(401);
    const code = totpAt(TEST_TOTP_SECRET, currentStep());
    const ok = await verify(pending, code);
    expect(ok.statusCode).toBe(200);
    const full = sessionCookie(ok);
    expect((await app.inject({ method: 'GET', url: '/api/admin/users', headers: { cookie: full } })).statusCode).toBe(200);
    // The pending session is gone and the same code is refused the second time.
    expect((await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: pending } })).statusCode).toBe(401);
    expect((await verify(sessionCookie(await login('admin', 'haslo-admina')), code)).statusCode).toBe(401);
  });

  it('kończy logowanie po pięciu błędnych kodach', async () => {
    await insertAdmin(db, 'admin', 'haslo-admina');
    const pending = sessionCookie(await login('admin', 'haslo-admina'));
    for (let attempt = 0; attempt < 4; attempt++) expect((await verify(pending, '111111')).statusCode).toBe(401);
    expect((await verify(pending, '111111')).json().message).toContain('Zaloguj się ponownie');
    expect((await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: pending } })).statusCode).toBe(401);
  });

  it('panel wymaga ustawienia weryfikacji; kody zapasowe działają po jednym razie', async () => {
    await insertAdmin(db, 'admin', 'haslo-admina', false);
    const first = await login('admin', 'haslo-admina');
    expect(first.json().mfaRequired).toBe(false);
    const cookie = sessionCookie(first);
    const blocked = await app.inject({ method: 'GET', url: '/api/admin/users', headers: { cookie } });
    expect(blocked.statusCode).toBe(403); expect(blocked.json().code).toBe('MFA_SETUP_REQUIRED');
    expect((await app.inject({ method: 'POST', url: '/api/auth/2fa/setup', headers: { cookie }, payload: { password: 'zle' } })).statusCode).toBe(403);
    const setup = (await app.inject({ method: 'POST', url: '/api/auth/2fa/setup', headers: { cookie }, payload: { password: 'haslo-admina' } })).json();
    expect(setup.uri).toContain('otpauth://totp/AcroNote');
    expect(setup.qrDataUrl).toMatch(/^data:image\/png;base64,/);
    expect((await app.inject({ method: 'POST', url: '/api/auth/2fa/enable', headers: { cookie }, payload: { code: '123456' } })).statusCode).toBe(400);
    const enabled = await app.inject({ method: 'POST', url: '/api/auth/2fa/enable', headers: { cookie }, payload: { code: totpAt(setup.secret, currentStep()) } });
    expect(enabled.statusCode).toBe(200);
    const codes: string[] = enabled.json().recoveryCodes;
    expect(codes).toHaveLength(10);
    expect((await app.inject({ method: 'GET', url: '/api/admin/users', headers: { cookie } })).statusCode).toBe(200);
    expect(JSON.stringify(db.prepare('SELECT code_hash FROM admin_recovery_codes').all())).not.toContain(codes[0]!.replace('-', ''));

    const pending = sessionCookie(await login('admin', 'haslo-admina'));
    const viaRecovery = await verify(pending, codes[0]!.toLowerCase());
    expect(viaRecovery.statusCode).toBe(200);
    expect(viaRecovery.json().recoveryCodesLeft).toBe(9);
    expect((await verify(sessionCookie(await login('admin', 'haslo-admina')), codes[0]!)).statusCode).toBe(401);
  });

  it('zwykły użytkownik nie włącza weryfikacji, a odebranie roli admina ją wyłącza', async () => {
    const adminId = await insertAdmin(db, 'admin', 'haslo-admina');
    const second = await insertAdmin(db, 'drugi admin', 'haslo-drugiego');
    await app.inject({ method: 'POST', url: '/api/auth/register', payload: { username: 'Ola', password: 'bezpieczne-haslo' } });
    const user = sessionCookie(await login('Ola', 'bezpieczne-haslo'));
    expect((await app.inject({ method: 'POST', url: '/api/auth/2fa/setup', headers: { cookie: user }, payload: { password: 'bezpieczne-haslo' } })).statusCode).toBe(403);
    const admin = await loginAdmin(app, 'admin', 'haslo-admina');
    expect((await app.inject({ method: 'PUT', url: `/api/admin/users/${second}`, headers: { cookie: admin }, payload: { role: 'user' } })).statusCode).toBe(200);
    expect(db.prepare('SELECT totp_secret FROM users WHERE id=?').get(second)).toEqual({ totp_secret: null });
    expect((await login('drugi admin', 'haslo-drugiego')).json().mfaRequired).toBe(false);
    expect(adminId).toBeGreaterThan(0);
  });

  it('reset hasła administratora nadal wymaga kodu z aplikacji', async () => {
    await insertAdmin(db, 'admin', 'haslo-admina');
    await insertAdmin(db, 'pomocnik', 'haslo-pomocnika');
    const sent = await app.inject({ method: 'POST', url: '/api/auth/password-reset', payload: { username: 'admin' } });
    const helper = await loginAdmin(app, 'pomocnik', 'haslo-pomocnika');
    const [row] = (await app.inject({ method: 'GET', url: '/api/admin/password-resets', headers: { cookie: helper } })).json();
    await app.inject({ method: 'POST', url: `/api/admin/password-resets/${row.id}/approve`, headers: { cookie: helper } });
    const done = await app.inject({ method: 'POST', url: '/api/auth/password-reset/complete', headers: { cookie: resetCookie(sent) }, payload: { newPassword: 'nowe-haslo-admina' } });
    expect(done.json().mfaRequired).toBe(true);
    expect((await app.inject({ method: 'GET', url: '/api/admin/users', headers: { cookie: sessionCookie(done) } })).statusCode).toBe(403);
  });
});
