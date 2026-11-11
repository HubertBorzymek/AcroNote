import type { FastifyInstance, FastifyRequest } from 'fastify';
import bcrypt from 'bcryptjs';
import QRCode from 'qrcode';
import { createHash, randomBytes, randomInt } from 'node:crypto';
import { usernameKey, type Db } from './db.js';
import { generateTotpSecret, otpauthUri, verifyTotp } from './totp.js';

type Guard = { preHandler: (request: FastifyRequest, reply: any) => Promise<unknown> };

export const PASSWORD_MIN_LENGTH = 8;
/** How long a request waits for the administrator, and how long an approval stays usable. */
export const RESET_REQUEST_HOURS = 72;
export const RESET_APPROVAL_HOURS = 24;
const RESET_COOKIE = 'acronote_reset';
const RESET_COOKIE_PATH = '/api/auth/password-reset';
const MFA_MAX_ATTEMPTS = 5;
const RECOVERY_CODE_COUNT = 10;
// No 0/O, 1/I/L — recovery codes are retyped from paper.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
const normalizeRecoveryCode = (value: string) => value.toUpperCase().replace(/[\s-]/g, '');

export function generateRecoveryCode(): string {
  const raw = Array.from({ length: 8 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}

/** Replaces the administrator's recovery codes; the plain codes are returned once and only hashes are stored. */
export function issueRecoveryCodes(db: Db, userId: number): string[] {
  const codes = Array.from({ length: RECOVERY_CODE_COUNT }, generateRecoveryCode);
  db.transaction(() => {
    db.prepare('DELETE FROM admin_recovery_codes WHERE user_id=?').run(userId);
    const insert = db.prepare('INSERT INTO admin_recovery_codes(user_id,code_hash) VALUES(?,?)');
    for (const code of codes) insert.run(userId, hashToken(normalizeRecoveryCode(code)));
  })();
  return codes;
}

/** Removes two-step login (used when the admin role is taken away and by the emergency CLI). */
export function clearTwoStep(db: Db, userId: number): void {
  db.transaction(() => {
    db.prepare('UPDATE users SET totp_secret=NULL,totp_pending_secret=NULL,totp_last_step=NULL WHERE id=?').run(userId);
    db.prepare('DELETE FROM admin_recovery_codes WHERE user_id=?').run(userId);
  })();
}

/** Effective status: a waiting request or an approval past its deadline counts as expired. */
const RESET_STATUS_SQL = `CASE
  WHEN r.status='pending' AND r.expires_at<=datetime('now') THEN 'expired'
  WHEN r.status='approved' AND r.approval_expires_at<=datetime('now') THEN 'expired'
  ELSE r.status END`;

type SessionOptions = { minutes?: number; mfaPending?: boolean };
type Helpers = {
  auth: Guard; adminAuth: Guard;
  startSession: (userId: number, reply: any, options?: SessionOptions) => string;
  /** Starts a full session, or one waiting for the authenticator code when the account uses two-step login. */
  completeLogin: (user: { id: number; totp_secret?: string | null }, reply: any) => { mfaRequired: boolean };
  publicUser: (user: any) => Record<string, unknown>;
  secureCookies: boolean;
  parseUsername: (value: unknown) => string;
  parsePassword: (value: unknown, label: string) => string;
};

export function registerAccountRoutes(app: FastifyInstance, db: Db, h: Helpers) {
  const resetCookie = (reply: any, token: string) => reply.setCookie(RESET_COOKIE, token, { httpOnly: true, sameSite: 'strict', secure: h.secureCookies, path: RESET_COOKIE_PATH, maxAge: 60 * 60 * RESET_REQUEST_HOURS });
  const clearResetCookie = (reply: any) => reply.clearCookie(RESET_COOKIE, { path: RESET_COOKIE_PATH });
  const ownReset = (request: FastifyRequest) => {
    const token = request.cookies[RESET_COOKIE];
    if (!token) return undefined;
    return db.prepare(`SELECT r.id,r.user_id userId,r.request_number requestNumber,u.username,${RESET_STATUS_SQL} status
      FROM password_resets r JOIN users u ON u.id=r.user_id WHERE r.token_hash=? AND u.deleted_at IS NULL`).get(hashToken(token)) as
      { id: number; userId: number; requestNumber: string; username: string; status: string } | undefined;
  };
  const resetView = (row: { requestNumber: string; username: string; status: string } | undefined) =>
    row ? { status: row.status, requestNumber: row.requestNumber, username: row.username } : { status: 'none' };

  // "Forgot password?" The request is tied to this device by an HttpOnly cookie: after the administrator
  // approves it, only this device can set the new password. The request number lets the administrator
  // check that the person asking for help is the one who sent the request.
  app.post('/api/auth/password-reset', { config: { rateLimit: { max: 5, timeWindow: '1 hour' } } }, async (request, reply) => {
    const body = (request.body ?? {}) as any;
    const own = ownReset(request);
    if (own && (own.status === 'pending' || own.status === 'approved')) return resetView(own);
    const username = h.parseUsername(body.username);
    const user = db.prepare('SELECT id,username FROM users WHERE username_key=? AND deleted_at IS NULL').get(usernameKey(username)) as { id: number; username: string } | undefined;
    // Registration already reveals whether a name is taken, so a clear answer here helps with typos without leaking more.
    if (!user) return reply.status(404).send({ message: 'Nie znaleziono konta o tej nazwie. Sprawdź pisownię.' });
    const active = db.prepare(`SELECT r.id FROM password_resets r WHERE r.user_id=? AND ${RESET_STATUS_SQL} IN ('pending','approved')`).get(user.id) as { id: number } | undefined;
    if (active) {
      db.prepare('UPDATE password_resets SET repeat_count=repeat_count+1 WHERE id=?').run(active.id);
      return reply.status(409).send({ message: 'Prośba o reset hasła dla tego konta już czeka na administratora. Napisz do niego albo poproś o odrzucenie starej prośby, aby wysłać nową.' });
    }
    const message = typeof body.message === 'string' && body.message.trim() ? body.message.trim().slice(0, 500) : null;
    const token = randomBytes(32).toString('base64url');
    const requestNumber = String(randomInt(1000, 10000));
    db.prepare("INSERT INTO password_resets(user_id,request_number,token_hash,message,expires_at) VALUES(?,?,?,?,datetime('now',?))")
      .run(user.id, requestNumber, hashToken(token), message, `+${RESET_REQUEST_HOURS} hours`);
    resetCookie(reply, token);
    return reply.status(201).send({ status: 'pending', requestNumber, username: user.username });
  });
  app.get('/api/auth/password-reset', async request => resetView(ownReset(request)));
  app.delete('/api/auth/password-reset', async (request, reply) => {
    const own = ownReset(request);
    if (own && (own.status === 'pending' || own.status === 'approved')) db.prepare("UPDATE password_resets SET status='cancelled',handled_at=CURRENT_TIMESTAMP WHERE id=?").run(own.id);
    clearResetCookie(reply);
    return { ok: true };
  });
  app.post('/api/auth/password-reset/complete', { config: { rateLimit: { max: 10, timeWindow: '15 minutes' } } }, async (request, reply) => {
    const own = ownReset(request);
    if (!own || own.status !== 'approved') return reply.status(403).send({ message: own?.status === 'pending' ? 'Administrator nie zatwierdził jeszcze tej prośby.' : 'Ta prośba nie pozwala już zmienić hasła. Wyślij nową.' });
    const password = h.parsePassword((request.body as any)?.newPassword, 'Nowe hasło');
    const hash = await bcrypt.hash(password, 12);
    db.transaction(() => {
      db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hash, own.userId);
      db.prepare('DELETE FROM sessions WHERE user_id=?').run(own.userId);
      db.prepare("UPDATE password_resets SET status='done',handled_at=CURRENT_TIMESTAMP WHERE id=?").run(own.id);
    })();
    clearResetCookie(reply);
    const user = db.prepare('SELECT id,username,athlete_enabled,coach_enabled,role,totp_secret FROM users WHERE id=?').get(own.userId) as any;
    return { ...h.publicUser(user), ...h.completeLogin(user, reply) };
  });

  // Second step of the login for accounts with an authenticator app (administrators).
  app.post('/api/auth/2fa/verify', { ...h.auth, config: { rateLimit: { max: 10, timeWindow: '15 minutes' } } }, async (request, reply) => {
    if (!request.session.mfaPending) return reply.status(400).send({ message: 'To logowanie nie wymaga kodu.' });
    const code = typeof (request.body as any)?.code === 'string' ? (request.body as any).code.trim() : '';
    const user = db.prepare('SELECT id,username,athlete_enabled,coach_enabled,role,totp_secret,totp_last_step FROM users WHERE id=?').get(request.userId) as any;
    let accepted = false;
    const step = user?.totp_secret ? verifyTotp(user.totp_secret, code, user.totp_last_step ?? null) : null;
    if (step !== null) { db.prepare('UPDATE users SET totp_last_step=? WHERE id=?').run(step, user.id); accepted = true; }
    else if (normalizeRecoveryCode(code).length === 8) {
      accepted = db.prepare("UPDATE admin_recovery_codes SET used_at=CURRENT_TIMESTAMP WHERE user_id=? AND code_hash=? AND used_at IS NULL").run(request.userId, hashToken(normalizeRecoveryCode(code))).changes > 0;
    }
    if (!accepted) {
      const attempts = (db.prepare('UPDATE sessions SET mfa_attempts=mfa_attempts+1 WHERE id=? RETURNING mfa_attempts').get(request.session.id) as { mfa_attempts: number }).mfa_attempts;
      if (attempts >= MFA_MAX_ATTEMPTS) {
        db.prepare('DELETE FROM sessions WHERE id=?').run(request.session.id);
        reply.clearCookie('acronote_session', { path: '/' });
        return reply.status(401).send({ message: 'Zbyt wiele błędnych kodów. Zaloguj się ponownie.' });
      }
      return reply.status(401).send({ message: 'Nieprawidłowy kod. Wpisz aktualny kod z aplikacji albo kod zapasowy.' });
    }
    db.prepare('DELETE FROM sessions WHERE id=?').run(request.session.id);
    h.startSession(user.id, reply);
    const remaining = (db.prepare('SELECT COUNT(*) count FROM admin_recovery_codes WHERE user_id=? AND used_at IS NULL').get(user.id) as { count: number }).count;
    return { ...h.publicUser(user), mfaRequired: false, recoveryCodesLeft: remaining };
  });

  app.get('/api/auth/2fa', h.auth, async request => {
    const row = db.prepare('SELECT totp_secret IS NOT NULL enabled,(SELECT COUNT(*) FROM admin_recovery_codes c WHERE c.user_id=users.id AND c.used_at IS NULL) recoveryCodesLeft FROM users WHERE id=?').get(request.userId) as { enabled: number; recoveryCodesLeft: number };
    return { enabled: !!row.enabled, recoveryCodesLeft: row.recoveryCodesLeft };
  });
  // Setting up two-step login is required before the admin panel opens (see authenticateAdmin).
  app.post('/api/auth/2fa/setup', { ...h.auth, config: { rateLimit: { max: 10, timeWindow: '15 minutes' } } }, async (request, reply) => {
    if (request.userRole !== 'admin') return reply.status(403).send({ message: 'Weryfikacja dwuetapowa jest dostępna dla administratorów.' });
    const user = db.prepare('SELECT username,password_hash,totp_secret FROM users WHERE id=?').get(request.userId) as any;
    if (user.totp_secret) return reply.status(409).send({ message: 'Weryfikacja dwuetapowa jest już włączona.' });
    const password = typeof (request.body as any)?.password === 'string' ? (request.body as any).password : '';
    if (!(await bcrypt.compare(password, user.password_hash))) return reply.status(403).send({ message: 'Hasło jest nieprawidłowe.' });
    const secret = generateTotpSecret();
    db.prepare('UPDATE users SET totp_pending_secret=? WHERE id=?').run(secret, request.userId);
    const uri = otpauthUri(secret, user.username);
    return { secret, uri, qrDataUrl: await QRCode.toDataURL(uri, { margin: 1, width: 240 }) };
  });
  app.post('/api/auth/2fa/enable', { ...h.auth, config: { rateLimit: { max: 10, timeWindow: '15 minutes' } } }, async (request, reply) => {
    if (request.userRole !== 'admin') return reply.status(403).send({ message: 'Weryfikacja dwuetapowa jest dostępna dla administratorów.' });
    const user = db.prepare('SELECT totp_pending_secret FROM users WHERE id=?').get(request.userId) as { totp_pending_secret: string | null };
    if (!user.totp_pending_secret) return reply.status(400).send({ message: 'Najpierw zeskanuj nowy kod QR.' });
    const step = verifyTotp(user.totp_pending_secret, String((request.body as any)?.code ?? ''), null);
    if (step === null) return reply.status(400).send({ message: 'Kod się nie zgadza. Wpisz aktualny kod z aplikacji.' });
    db.transaction(() => {
      db.prepare('UPDATE users SET totp_secret=totp_pending_secret,totp_pending_secret=NULL,totp_last_step=? WHERE id=?').run(step, request.userId);
      db.prepare('DELETE FROM sessions WHERE user_id=? AND id<>?').run(request.userId, request.session.id);
    })();
    return { enabled: true, recoveryCodes: issueRecoveryCodes(db, request.userId) };
  });
  app.post('/api/auth/2fa/recovery-codes', { ...h.auth, config: { rateLimit: { max: 10, timeWindow: '15 minutes' } } }, async (request, reply) => {
    const user = db.prepare('SELECT totp_secret,totp_last_step FROM users WHERE id=?').get(request.userId) as any;
    if (!user?.totp_secret) return reply.status(400).send({ message: 'Weryfikacja dwuetapowa nie jest włączona.' });
    const step = verifyTotp(user.totp_secret, String((request.body as any)?.code ?? ''), user.totp_last_step ?? null);
    if (step === null) return reply.status(400).send({ message: 'Kod się nie zgadza. Wpisz aktualny kod z aplikacji.' });
    db.prepare('UPDATE users SET totp_last_step=? WHERE id=?').run(step, request.userId);
    return { recoveryCodes: issueRecoveryCodes(db, request.userId) };
  });

  app.get('/api/admin/summary', h.adminAuth, async () => db.prepare(`SELECT
    (SELECT COUNT(*) FROM password_resets r WHERE ${RESET_STATUS_SQL}='pending') pendingResets,
    (SELECT COUNT(*) FROM bug_reports WHERE status='new') newBugReports`).get());
  app.get('/api/admin/password-resets', h.adminAuth, async request => {
    const all = (request.query as any).status === 'all';
    return db.prepare(`SELECT r.id,r.user_id userId,u.username,r.request_number requestNumber,r.message,${RESET_STATUS_SQL} status,
      r.created_at createdAt,r.handled_at handledAt,r.approval_expires_at approvalExpiresAt,r.repeat_count repeatCount
      FROM password_resets r JOIN users u ON u.id=r.user_id
      ${all ? '' : `WHERE ${RESET_STATUS_SQL} IN ('pending','approved')`} ORDER BY r.id DESC LIMIT 200`).all();
  });
  app.post('/api/admin/password-resets/:id/approve', h.adminAuth, async (request, reply) => {
    const info = db.prepare(`UPDATE password_resets SET status='approved',handled_at=CURRENT_TIMESTAMP,approval_expires_at=datetime('now',?)
      WHERE id=? AND status='pending' AND expires_at>datetime('now')`).run(`+${RESET_APPROVAL_HOURS} hours`, Number((request.params as any).id));
    if (!info.changes) return reply.status(404).send({ message: 'Nie znaleziono oczekującej prośby.' });
    return { ok: true, validHours: RESET_APPROVAL_HOURS };
  });
  app.post('/api/admin/password-resets/:id/reject', h.adminAuth, async (request, reply) => {
    const info = db.prepare("UPDATE password_resets SET status='rejected',handled_at=CURRENT_TIMESTAMP WHERE id=? AND status IN ('pending','approved')").run(Number((request.params as any).id));
    if (!info.changes) return reply.status(404).send({ message: 'Nie znaleziono aktywnej prośby.' });
    return { ok: true };
  });
}
