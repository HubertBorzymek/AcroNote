import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { schema } from './schema.js';
import { parseElementCode } from '@acronote/shared';

export type Db = Database.Database;

/** Resolves DATABASE_PATH the same way everywhere: relative paths are relative to the project root. */
export function resolveDatabasePath(path = process.env.DATABASE_PATH ?? './data/acronote.db'): string {
  const projectRoot = fileURLToPath(new URL('../../../', import.meta.url));
  return path === ':memory:' ? path : (isAbsolute(path) ? path : resolve(projectRoot, path));
}

export function openDatabase(path?: string): Db {
  const resolved = resolveDatabasePath(path);
  if (resolved !== ':memory:') mkdirSync(dirname(resolved), { recursive: true });
  const db = new Database(resolved);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(schema);
  db.prepare('INSERT OR IGNORE INTO migrations(version) VALUES(1)').run();
  migrate(db);
  return db;
}

function migrate(db: Db): void {
  const columns = (table: string) => new Set((db.prepare(`PRAGMA table_info(${table})`).all() as { name:string }[]).map(row => row.name));
  const userColumns = columns('users');
  if (!userColumns.has('role')) db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'");
  if (!userColumns.has('deleted_at')) db.exec('ALTER TABLE users ADD COLUMN deleted_at TEXT');
  const elementColumns = columns('elements');
  const additions: [string,string][] = [['quarter_count','INTEGER'],['salto_count','INTEGER'],['total_twist_halves','INTEGER'],['direction','TEXT'],['position_symbol','TEXT']];
  for (const [name,type] of additions) if (!elementColumns.has(name)) db.exec(`ALTER TABLE elements ADD COLUMN ${name} ${type}`);

  db.transaction(() => {
    // Catalog values are mutable; historical names in training snapshots are intentionally untouched.
    db.prepare("UPDATE execution_types SET name='Siatka' WHERE name='Na płasko' AND deleted_at IS NULL AND NOT EXISTS (SELECT 1 FROM execution_types other WHERE other.user_id=execution_types.user_id AND other.name='Siatka')").run();
    db.prepare("UPDATE execution_types SET deleted_at=CURRENT_TIMESTAMP WHERE name='Na płasko' AND deleted_at IS NULL AND EXISTS (SELECT 1 FROM execution_types other WHERE other.user_id=execution_types.user_id AND other.name='Siatka' AND other.deleted_at IS NULL)").run();
    const update = db.prepare('UPDATE elements SET quarter_count=?,salto_count=?,total_twist_halves=?,direction=?,position_symbol=? WHERE id=?');
    for (const row of db.prepare('SELECT id,code FROM elements').all() as {id:number;code:string}[]) {
      const parsed = parseElementCode(row.code);
      update.run(parsed?.quarterCount ?? null, parsed?.saltoCount ?? null, parsed?.totalTwistHalves ?? null, parsed?.direction ?? null, parsed?.positionSymbol ?? null, row.id);
    }
    db.prepare('INSERT OR IGNORE INTO migrations(version) VALUES(2)').run();
  })();

  const invitationColumns = columns('invitations');
  if (!invitationColumns.has('accepted_by_id')) db.exec('ALTER TABLE invitations ADD COLUMN accepted_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL');
  if (!invitationColumns.has('cancelled_at')) db.exec('ALTER TABLE invitations ADD COLUMN cancelled_at TEXT');
  if (!invitationColumns.has('created_at')) db.exec('ALTER TABLE invitations ADD COLUMN created_at TEXT');
  db.transaction(() => {
    db.prepare('UPDATE invitations SET created_at=COALESCE(created_at, CURRENT_TIMESTAMP)').run();
    db.prepare('INSERT OR IGNORE INTO migrations(version) VALUES(3)').run();
  })();
  // v4: bug_reports table (created by the schema above).
  db.prepare('INSERT OR IGNORE INTO migrations(version) VALUES(4)').run();
}

export function seedExecutionTypes(db: Db, userId: number): void {
  const insert = db.prepare('INSERT OR IGNORE INTO execution_types(user_id,name,sort_order) VALUES(?,?,?)');
  ['Siatka', 'Materac', 'Gąbki'].forEach((name, index) => insert.run(userId, name, index));
}
