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
  // Used by the users_username_key triggers; must be registered on every connection that writes users.
  db.function('acronote_username_key', { deterministic: true }, (value: unknown) => typeof value === 'string' ? usernameKey(value) : null);
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

  // v5: Unicode-aware unique usernames ("Łukasz" = "łukasz"; SQLite NOCASE only folds ASCII),
  // one-time password reset codes, impersonation and password-change-only sessions.
  const v5Users = columns('users');
  if (!v5Users.has('username_key')) db.exec('ALTER TABLE users ADD COLUMN username_key TEXT');
  if (!v5Users.has('reset_code_hash')) db.exec('ALTER TABLE users ADD COLUMN reset_code_hash TEXT');
  if (!v5Users.has('reset_code_expires_at')) db.exec('ALTER TABLE users ADD COLUMN reset_code_expires_at TEXT');
  const v5Sessions = columns('sessions');
  if (!v5Sessions.has('impersonator_id')) db.exec('ALTER TABLE sessions ADD COLUMN impersonator_id INTEGER REFERENCES users(id) ON DELETE CASCADE');
  if (!v5Sessions.has('password_change_only')) db.exec('ALTER TABLE sessions ADD COLUMN password_change_only INTEGER NOT NULL DEFAULT 0');
  db.exec(`CREATE TRIGGER IF NOT EXISTS users_username_key_insert AFTER INSERT ON users BEGIN
      UPDATE users SET username_key=acronote_username_key(NEW.username) WHERE id=NEW.id; END;
    CREATE TRIGGER IF NOT EXISTS users_username_key_update AFTER UPDATE OF username ON users BEGIN
      UPDATE users SET username_key=acronote_username_key(NEW.username) WHERE id=NEW.id; END;`);
  const fill = db.prepare('UPDATE users SET username_key=? WHERE id=?');
  for (const row of db.prepare('SELECT id,username FROM users WHERE username_key IS NULL').all() as { id: number; username: string }[]) fill.run(usernameKey(row.username), row.id);
  try { db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_key ON users(username_key)'); }
  catch { console.warn('Uwaga: w bazie są konta różniące się tylko wielkością liter. Nowe duplikaty blokuje kontrola w API.'); }
  db.prepare('INSERT OR IGNORE INTO migrations(version) VALUES(5)').run();
}

/** Case- and normalization-insensitive form of a username, used for uniqueness and login. */
export function usernameKey(username: string): string {
  return username.normalize('NFC').toLowerCase();
}

export function seedExecutionTypes(db: Db, userId: number): void {
  const insert = db.prepare('INSERT OR IGNORE INTO execution_types(user_id,name,sort_order) VALUES(?,?,?)');
  ['Siatka', 'Materac', 'Gąbki'].forEach((name, index) => insert.run(userId, name, index));
}
