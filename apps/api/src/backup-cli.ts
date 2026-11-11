// Writes a consistent copy of the database (VACUUM INTO also captures the WAL) to the given file.
// Used by scripts/backup-prod.ps1 on the server: fly ssh console -C "node apps/api/dist/backup-cli.js /tmp/acronote-copy.db"
import Database from 'better-sqlite3';
import { existsSync, rmSync } from 'node:fs';
import { resolveDatabasePath } from './db.js';

const target = process.argv[2];
if (!target) { console.error('Użycie: node apps/api/dist/backup-cli.js <plik docelowy>'); process.exit(1); }
const source = resolveDatabasePath();
if (source === ':memory:' || !existsSync(source)) { console.error(`Nie znaleziono bazy: ${source}`); process.exit(1); }
if (existsSync(target)) rmSync(target);
const db = new Database(source, { fileMustExist: true, readonly: true });
try { db.prepare('VACUUM INTO ?').run(target); }
finally { db.close(); }
const copy = new Database(target, { readonly: true });
const check = copy.pragma('integrity_check', { simple: true });
const counts = copy.prepare('SELECT (SELECT COUNT(*) FROM users) users,(SELECT COUNT(*) FROM trainings) trainings').get() as { users: number; trainings: number };
copy.close();
if (check !== 'ok') { console.error(`Kopia jest uszkodzona: ${check}`); process.exit(1); }
console.log(`Kopia gotowa: ${target} (kont: ${counts.users}, treningów: ${counts.trainings})`);
