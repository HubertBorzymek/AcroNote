import { dirname, join } from 'node:path';
import { APP_VERSION, buildApp } from './app.js';
import { backupIfDue } from './backup.js';
import { openDatabase, resolveDatabasePath } from './db.js';
import { COACH_DEMO_CREDENTIALS, DEMO_CREDENTIALS, seedDemoIfEmpty } from './seed.js';

// Locally (default): one server with everything, demo accounts on an empty database.
// ACRONOTE_ENV=production (Fly.io): no demo accounts, Secure cookies, a daily/pre-migration
// backup, and the admin panel only on ADMIN_PORT, which is bound to the private network.
const production = process.env.ACRONOTE_ENV === 'production';
const env = (name: string) => process.env[name]?.trim() || undefined;
const port = Number(env('PORT') ?? 3001);
const host = env('HOST') ?? '127.0.0.1';
const adminPort = env('ADMIN_PORT') ? Number(env('ADMIN_PORT')) : undefined;
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
  adminRoutes: !production && adminPort === undefined,
  secureCookies: production || env('SECURE_COOKIES') === '1',
  trustProxy: Number(env('TRUST_PROXY') ?? 0),
});
const admin = adminPort === undefined ? undefined : await buildApp({ db, logger, adminRoutes: true });
const servers = [app, ...(admin ? [admin] : [])];
const shutdown = async () => { await Promise.allSettled(servers.map(server => server.close())); db.close(); process.exit(0); };
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);

await app.listen({ port, host });
console.log(`AcroNote działa pod adresem http://${host === '127.0.0.1' ? 'localhost' : host}:${port} (wersja ${APP_VERSION})`);
if (admin) {
  // A problem with the private admin listener must never take the public site down.
  try {
    await admin.listen({ port: adminPort!, host: env('ADMIN_HOST') ?? '127.0.0.1' });
    console.log(`Panel administratora: port ${adminPort} (${env('ADMIN_HOST') ?? '127.0.0.1'})`);
  } catch (error) { console.error('Nie udało się uruchomić panelu administratora:', error); }
}
if (production) setInterval(backup, 6 * 60 * 60 * 1000).unref();
