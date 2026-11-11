import { dirname, join } from 'node:path';
import { APP_VERSION, buildApp } from './app.js';
import { backupIfDue } from './backup.js';
import { openDatabase, resolveDatabasePath } from './db.js';
import { COACH_DEMO_CREDENTIALS, DEMO_CREDENTIALS, seedDemoIfEmpty } from './seed.js';

// Locally (default): demo accounts on an empty database, plain HTTP.
// ACRONOTE_ENV=production (Fly.io): no demo accounts, Secure cookies and a database copy before the
// first start of every new version (i.e. before its migrations) plus a daily one.
const production = process.env.ACRONOTE_ENV === 'production';
const env = (name: string) => process.env[name]?.trim() || undefined;
const port = Number(env('PORT') ?? 3001);
const host = env('HOST') ?? '127.0.0.1';
const logger = { level: env('LOG_LEVEL') ?? 'info' };

const dbPath = resolveDatabasePath();
const backupDir = env('BACKUP_DIR') ?? join(dirname(dbPath), 'backups');
const backup = () => { try { const file = backupIfDue(dbPath, backupDir, APP_VERSION); if (file) console.log(`Kopia bazy: ${file}`); } catch (error) { console.error('Nie udało się wykonać kopii bazy:', error); } };
if (production) backup();

const db = openDatabase(dbPath);
if (!production && env('ACRONOTE_DEMO') !== '0' && await seedDemoIfEmpty(db)) {
  console.log(`Nowa baza: utworzono konta demo ${DEMO_CREDENTIALS.username} / ${DEMO_CREDENTIALS.password} oraz ${COACH_DEMO_CREDENTIALS.username} / ${COACH_DEMO_CREDENTIALS.password}`);
}

const app = await buildApp({
  db, logger,
  secureCookies: production || env('SECURE_COOKIES') === '1',
  trustProxy: Number(env('TRUST_PROXY') ?? 0),
});
const shutdown = async () => { await app.close().catch(() => undefined); db.close(); process.exit(0); };
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);

await app.listen({ port, host });
console.log(`AcroNote działa pod adresem http://${host === '127.0.0.1' ? 'localhost' : host}:${port} (wersja ${APP_VERSION})`);
if (production) setInterval(backup, 6 * 60 * 60 * 1000).unref();
