import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { schema } from './schema.js';

export type Db = Database.Database;

export function openDatabase(path = process.env.DATABASE_PATH ?? './data/acronote.db'): Db {
  const projectRoot = fileURLToPath(new URL('../../../', import.meta.url));
  const resolved = path === ':memory:' ? path : (isAbsolute(path) ? path : resolve(projectRoot, path));
  if (resolved !== ':memory:') mkdirSync(dirname(resolved), { recursive: true });
  const db = new Database(resolved);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(schema);
  db.prepare('INSERT OR IGNORE INTO migrations(version) VALUES(1)').run();
  return db;
}

export function seedExecutionTypes(db: Db, userId: number): void {
  const insert = db.prepare('INSERT OR IGNORE INTO execution_types(user_id,name,sort_order) VALUES(?,?,?)');
  ['Na płasko', 'Materac', 'Gąbki'].forEach((name, index) => insert.run(userId, name, index));
}
