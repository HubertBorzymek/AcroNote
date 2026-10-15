import type { FastifyInstance, FastifyRequest } from 'fastify';
import { createHash, randomInt } from 'node:crypto';
import { usernameKey, type Db } from './db.js';

type Guard = { preHandler: (request: FastifyRequest, reply: any) => Promise<unknown> };

export const PASSWORD_MIN_LENGTH = 8;
export const RESET_CODE_HOURS = 72;
const IMPERSONATION_HOURS = 2;
const RESET_REQUEST_COOLDOWN_HOURS = 24;
// No 0/O, 1/I/L — the code is read aloud or retyped from a phone.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
export const normalizeResetCode = (value: string) => value.toUpperCase().replace(/[\s-]/g, '');

export function generateResetCode(): string {
  const raw = Array.from({ length: 8 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}

/** Issues a one-time code the user enters instead of a password, then sets a new password. */
export function issueResetCode(db: Db, userId: number): { code: string; expiresAt: string } {
  const code = generateResetCode();
  db.transaction(() => {
    db.prepare(`UPDATE users SET reset_code_hash=?,reset_code_expires_at=datetime('now',?) WHERE id=?`).run(hashToken(normalizeResetCode(code)), `+${RESET_CODE_HOURS} hours`, userId);
    db.prepare("UPDATE password_reset_requests SET status='done',handled_at=CURRENT_TIMESTAMP WHERE user_id=? AND status='pending'").run(userId);
  })();
  const { expiresAt } = db.prepare('SELECT reset_code_expires_at expiresAt FROM users WHERE id=?').get(userId) as { expiresAt: string };
  return { code, expiresAt };
}

type Helpers = {
  auth: Guard; adminAuth: Guard; adminEnabled: boolean;
  startSession: (userId: number, reply: any, options?: { impersonatorId?: number; hours?: number; passwordChangeOnly?: boolean }) => string;
  secureCookies: boolean;
  parseUsername: (value: unknown) => string;
};

export function registerAccountRoutes(app: FastifyInstance, db: Db, h: Helpers) {
  // "Forgot password?" — always the same answer, so it cannot be used to discover usernames.
  app.post('/api/auth/password-reset-requests', { config: { rateLimit: { max: 3, timeWindow: '1 hour' } } }, async (request, reply) => {
    const body = (request.body ?? {}) as any;
    const message = typeof body.message === 'string' && body.message.trim() ? body.message.trim().slice(0, 500) : null;
    let username: string | null = null;
    try { username = h.parseUsername(body.username); } catch { /* invalid name: same generic answer */ }
    const user = username ? db.prepare('SELECT id FROM users WHERE username_key=? AND deleted_at IS NULL').get(usernameKey(username)) as { id: number } | undefined : undefined;
    if (user) {
      const recent = db.prepare(`SELECT 1 FROM password_reset_requests WHERE user_id=? AND created_at>datetime('now',?)`).get(user.id, `-${RESET_REQUEST_COOLDOWN_HOURS} hours`);
      if (!recent) db.prepare('INSERT INTO password_reset_requests(user_id,message) VALUES(?,?)').run(user.id, message);
    }
    return reply.status(202).send({ ok: true, message: 'Jeśli takie konto istnieje, administrator otrzyma prośbę o reset hasła i przekaże Ci kod.' });
  });

  if (!h.adminEnabled) return;

  app.get('/api/admin/password-reset-requests', h.adminAuth, async request => {
    const all = (request.query as any).status === 'all';
    return db.prepare(`SELECT p.id,p.user_id userId,u.username,p.message,p.status,p.created_at createdAt,p.handled_at handledAt,
      u.reset_code_expires_at>datetime('now') resetCodeActive FROM password_reset_requests p JOIN users u ON u.id=p.user_id
      ${all ? '' : "WHERE p.status='pending'"} ORDER BY p.status='pending' DESC,p.id DESC LIMIT 200`).all();
  });
  app.post('/api/admin/password-reset-requests/:id/reject', h.adminAuth, async (request, reply) => {
    const info = db.prepare("UPDATE password_reset_requests SET status='rejected',handled_at=CURRENT_TIMESTAMP WHERE id=? AND status='pending'").run(Number((request.params as any).id));
    if (!info.changes) return reply.status(404).send({ message: 'Nie znaleziono oczekującej prośby.' });
    return { ok: true };
  });
  app.post('/api/admin/users/:userId/reset-code', h.adminAuth, async (request, reply) => {
    const userId = Number((request.params as any).userId);
    const user = db.prepare('SELECT username FROM users WHERE id=? AND deleted_at IS NULL').get(userId) as { username: string } | undefined;
    if (!user) return reply.status(404).send({ message: 'Nie znaleziono aktywnego konta.' });
    return { username: user.username, ...issueResetCode(db, userId), validHours: RESET_CODE_HOURS };
  });
  app.delete('/api/admin/users/:userId/reset-code', h.adminAuth, async (request, reply) => {
    const info = db.prepare('UPDATE users SET reset_code_hash=NULL,reset_code_expires_at=NULL WHERE id=? AND reset_code_hash IS NOT NULL').run(Number((request.params as any).userId));
    if (!info.changes) return reply.status(404).send({ message: 'To konto nie ma aktywnego kodu.' });
    return { ok: true };
  });

  // Open a user's account in the normal app (to view or edit anything they can) without knowing
  // their password. The admin session is kept in a side cookie and restored when finished.
  app.post('/api/admin/users/:userId/impersonate', h.adminAuth, async (request, reply) => {
    const userId = Number((request.params as any).userId);
    if (userId === request.userId) return reply.status(400).send({ message: 'To jest Twoje konto.' });
    if (!db.prepare('SELECT 1 FROM users WHERE id=? AND deleted_at IS NULL').get(userId)) return reply.status(404).send({ message: 'Nie znaleziono aktywnego konta.' });
    reply.setCookie('acronote_admin_return', request.cookies.acronote_session!, { httpOnly: true, sameSite: 'strict', secure: h.secureCookies, path: '/', maxAge: 60 * 60 * IMPERSONATION_HOURS });
    h.startSession(userId, reply, { impersonatorId: request.userId, hours: IMPERSONATION_HOURS });
    return { ok: true };
  });
  app.post('/api/auth/impersonation/end', h.auth, async (request, reply) => {
    if (!request.session.impersonatorId) return reply.status(400).send({ message: 'Nie przeglądasz cudzego konta.' });
    db.prepare('DELETE FROM sessions WHERE id=?').run(request.session.id);
    const back = request.cookies.acronote_admin_return;
    const valid = back && db.prepare(`SELECT 1 FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.user_id=? AND s.expires_at>datetime('now') AND u.role='admin' AND u.deleted_at IS NULL`).get(hashToken(back), request.session.impersonatorId);
    reply.clearCookie('acronote_admin_return', { path: '/' });
    if (valid) reply.setCookie('acronote_session', back, { httpOnly: true, sameSite: 'strict', secure: h.secureCookies, path: '/', maxAge: 60 * 60 * 24 * 30 });
    else reply.clearCookie('acronote_session', { path: '/' });
    return { ok: true, restored: Boolean(valid) };
  });
}
