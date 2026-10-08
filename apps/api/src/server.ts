import { buildApp } from './app.js';
import { openDatabase } from './db.js';
import { COACH_DEMO_CREDENTIALS, DEMO_CREDENTIALS, seedDemoIfEmpty } from './seed.js';

const db = openDatabase();
if (process.env.ACRONOTE_DEMO !== '0' && await seedDemoIfEmpty(db)) {
  console.log(`Nowa baza: utworzono konta demo ${DEMO_CREDENTIALS.username} / ${DEMO_CREDENTIALS.password} oraz ${COACH_DEMO_CREDENTIALS.username} / ${COACH_DEMO_CREDENTIALS.password}`);
}
const app = await buildApp({ db, logger: { level: process.env.LOG_LEVEL ?? 'info' } });
app.addHook('onClose', async () => { db.close(); });
const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST ?? '127.0.0.1';
await app.listen({ port, host });
console.log(`AcroNote działa pod adresem http://${host === '127.0.0.1' ? 'localhost' : host}:${port}`);
