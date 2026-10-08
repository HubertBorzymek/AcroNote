import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Db } from './db.js';
import { getTraining } from './training-service.js';

type Guard = { preHandler: (request: FastifyRequest, reply: any) => Promise<unknown> };

export const SNAPSHOT_FORMAT = 'acronote-user-snapshot';
const MAX_DIAGNOSTICS_BYTES = 200_000;
const SNAPSHOT_TRAINING_LIMIT = 200;

/**
 * Everything needed to rebuild the reporter's account locally (see import-report.ts):
 * catalog rows including deleted ones, routine templates and full training snapshots.
 * Never contains passwords, password hashes, sessions or invitation tokens.
 */
export function buildUserSnapshot(db: Db, userId: number) {
  const user = db.prepare('SELECT username,athlete_enabled athleteEnabled,coach_enabled coachEnabled,created_at createdAt FROM users WHERE id=?').get(userId) as any;
  const routines = db.prepare('SELECT id,name,template_version templateVersion,slot_count slotCount,deleted_at deletedAt FROM routines WHERE user_id=? ORDER BY id').all(userId) as any[];
  const items = db.prepare('SELECT position,element_id elementId,code_snapshot code,name_snapshot name FROM routine_items WHERE routine_id=? ORDER BY position');
  for (const routine of routines) routine.items = items.all(routine.id);
  const trainingIds = db.prepare('SELECT id FROM trainings WHERE user_id=? ORDER BY training_date DESC,id DESC LIMIT ?').all(userId, SNAPSHOT_TRAINING_LIMIT) as { id: number }[];
  const totalTrainings = (db.prepare('SELECT COUNT(*) count FROM trainings WHERE user_id=?').get(userId) as { count: number }).count;
  return {
    format: SNAPSHOT_FORMAT, version: 1, createdAt: new Date().toISOString(),
    user: { ...user, athleteEnabled: !!user?.athleteEnabled, coachEnabled: !!user?.coachEnabled },
    executionTypes: db.prepare('SELECT id,name,sort_order sortOrder,hidden,deleted_at deletedAt FROM execution_types WHERE user_id=? ORDER BY sort_order,id').all(userId),
    elements: db.prepare('SELECT id,code,name,favorite,hidden,deleted_at deletedAt,created_at createdAt FROM elements WHERE user_id=? ORDER BY id').all(userId),
    routines,
    trainings: trainingIds.map(row => getTraining(db, userId, row.id)).reverse(),
    trainingsTruncated: totalTrainings > trainingIds.length,
  };
}

const optionalText = (value: unknown, max: number) => typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;

export function registerBugReportRoutes(app: FastifyInstance, db: Db, guards: { auth: Guard; adminAuth: Guard; adminEnabled: boolean; appVersion: string }) {
  const { auth, adminAuth } = guards;

  app.post('/api/bug-reports', { ...auth, config: { rateLimit: { max: 5, timeWindow: '10 minutes' } } }, async (request, reply) => {
    const b = (request.body ?? {}) as any;
    const description = optionalText(b.description, 5000);
    if (!description || description.length < 5) return reply.status(400).send({ message: 'Opisz problem w co najmniej kilku słowach.' });
    let diagnostics: string | null = null;
    if (b.diagnostics !== undefined && b.diagnostics !== null) {
      diagnostics = JSON.stringify(b.diagnostics);
      if (Buffer.byteLength(diagnostics) > MAX_DIAGNOSTICS_BYTES) return reply.status(400).send({ message: 'Dane diagnostyczne są zbyt duże.' });
    }
    const user = db.prepare('SELECT username FROM users WHERE id=?').get(request.userId) as { username: string };
    const snapshot = b.includeSnapshot ? JSON.stringify(buildUserSnapshot(db, request.userId)) : null;
    const id = Number(db.prepare(`INSERT INTO bug_reports(user_id,username_snapshot,description,expected,page,app_version,user_agent,diagnostics,data_snapshot)
      VALUES(?,?,?,?,?,?,?,?,?)`).run(request.userId, user.username, description, optionalText(b.expected, 5000), optionalText(b.page, 300),
      guards.appVersion, optionalText(request.headers['user-agent'], 500), diagnostics, snapshot).lastInsertRowid);
    return reply.status(201).send({ id, status: 'new' });
  });

  app.get('/api/bug-reports/mine', auth, async request => db.prepare(`SELECT id,substr(description,1,200) description,status,created_at createdAt,resolved_at resolvedAt
    FROM bug_reports WHERE user_id=? ORDER BY id DESC LIMIT 50`).all(request.userId));

  if (!guards.adminEnabled) return;

  app.get('/api/admin/bug-reports', adminAuth, async request => {
    const status = (request.query as any).status;
    const filter = status === 'new' || status === 'resolved' ? 'WHERE status=?' : '';
    return db.prepare(`SELECT id,user_id userId,username_snapshot username,substr(description,1,200) description,page,app_version appVersion,status,
      created_at createdAt,resolved_at resolvedAt,data_snapshot IS NOT NULL hasSnapshot FROM bug_reports ${filter} ORDER BY id DESC LIMIT 500`).all(...(filter ? [status] : []));
  });
  app.get('/api/admin/bug-reports/:id', adminAuth, async (request, reply) => {
    const row = db.prepare('SELECT * FROM bug_reports WHERE id=?').get(Number((request.params as any).id)) as any;
    if (!row) return reply.status(404).send({ message: 'Nie znaleziono zgłoszenia.' });
    return { id: row.id, userId: row.user_id, username: row.username_snapshot, description: row.description, expected: row.expected, page: row.page,
      appVersion: row.app_version, userAgent: row.user_agent, status: row.status, createdAt: row.created_at, resolvedAt: row.resolved_at,
      diagnostics: row.diagnostics ? JSON.parse(row.diagnostics) : null, dataSnapshot: row.data_snapshot ? JSON.parse(row.data_snapshot) : null };
  });
  app.put('/api/admin/bug-reports/:id', adminAuth, async (request, reply) => {
    const status = (request.body as any)?.status;
    if (status !== 'new' && status !== 'resolved') return reply.status(400).send({ message: 'Status musi mieć wartość new albo resolved.' });
    const info = db.prepare(`UPDATE bug_reports SET status=?,resolved_at=${status === 'resolved' ? 'CURRENT_TIMESTAMP' : 'NULL'} WHERE id=?`).run(status, Number((request.params as any).id));
    if (!info.changes) return reply.status(404).send({ message: 'Nie znaleziono zgłoszenia.' });
    return { ok: true };
  });
  app.delete('/api/admin/bug-reports/:id', adminAuth, async (request, reply) => {
    const info = db.prepare('DELETE FROM bug_reports WHERE id=?').run(Number((request.params as any).id));
    if (!info.changes) return reply.status(404).send({ message: 'Nie znaleziono zgłoszenia.' });
    return { ok: true };
  });
}
