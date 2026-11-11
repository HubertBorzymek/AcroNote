import bcrypt from 'bcryptjs';
import type { buildApp } from '../src/app.js';
import type { Db } from '../src/db.js';
import { currentStep, totpAt } from '../src/totp.js';

type App = Awaited<ReturnType<typeof buildApp>>;

/** Fixed test secret (base32); never used outside tests. */
export const TEST_TOTP_SECRET = 'JBSWY3DPEHPK3PXP';

export const sessionCookie = (response: { cookies: { name: string; value: string }[] }) => {
  const session = response.cookies.find(cookie => cookie.name === 'acronote_session');
  return session ? `acronote_session=${session.value}` : '';
};

/** An administrator with two-step login already set up (required by the admin panel). */
export async function insertAdmin(db: Db, username: string, password: string, twoStep = true): Promise<number> {
  return Number(db.prepare("INSERT INTO users(username,password_hash,role,totp_secret) VALUES(?,?,'admin',?)")
    .run(username, await bcrypt.hash(password, 4), twoStep ? TEST_TOTP_SECRET : null).lastInsertRowid);
}

/** Password, then the current authenticator code. Returns the full session cookie. */
export async function loginAdmin(app: App, username: string, password: string, secret = TEST_TOTP_SECRET): Promise<string> {
  const first = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username, password } });
  if (!first.json().mfaRequired) return sessionCookie(first);
  const second = await app.inject({ method: 'POST', url: '/api/auth/2fa/verify', headers: { cookie: sessionCookie(first) }, payload: { code: totpAt(secret, currentStep()) } });
  if (second.statusCode !== 200) throw new Error(`Logowanie administratora nie powiodło się: ${second.body}`);
  return sessionCookie(second);
}
