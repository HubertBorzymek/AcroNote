import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { schema } from './schema.js';
import { parseCatalogCode, type ElementCatalog } from '@acronote/shared';

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
    // Recomputed on every start with the parser of the element's catalog (tumbling codes are not trampoline codes).
    const hasCatalog = columns('elements').has('catalog');
    for (const row of db.prepare(`SELECT id,code,${hasCatalog ? 'catalog' : "'trampoline' catalog"} FROM elements`).all() as {id:number;code:string;catalog:ElementCatalog}[]) {
      const parsed = parseCatalogCode(row.catalog, row.code);
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

  // v5: Unicode-aware unique usernames ("Łukasz" = "łukasz"; SQLite NOCASE only folds ASCII).
  if (!columns('users').has('username_key')) db.exec('ALTER TABLE users ADD COLUMN username_key TEXT');
  db.exec(`CREATE TRIGGER IF NOT EXISTS users_username_key_insert AFTER INSERT ON users BEGIN
      UPDATE users SET username_key=acronote_username_key(NEW.username) WHERE id=NEW.id; END;
    CREATE TRIGGER IF NOT EXISTS users_username_key_update AFTER UPDATE OF username ON users BEGIN
      UPDATE users SET username_key=acronote_username_key(NEW.username) WHERE id=NEW.id; END;`);
  const fill = db.prepare('UPDATE users SET username_key=? WHERE id=?');
  for (const row of db.prepare('SELECT id,username FROM users WHERE username_key IS NULL').all() as { id: number; username: string }[]) fill.run(usernameKey(row.username), row.id);
  try { db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_key ON users(username_key)'); }
  catch { console.warn('Uwaga: w bazie są konta różniące się tylko wielkością liter. Nowe duplikaty blokuje kontrola w API.'); }
  db.prepare('INSERT OR IGNORE INTO migrations(version) VALUES(5)').run();

  // v6: optional times (ms) in training snapshots, a private training rating, two-step login for
  // administrators and sessions that wait for the second step. All columns are nullable or defaulted,
  // so existing rows keep their meaning.
  db.transaction(() => {
    const add = (table: string, column: string, definition: string) => { if (!columns(table).has(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`); };
    add('activities', 'time_ms', 'INTEGER');
    add('activity_elements', 'time_ms', 'INTEGER');
    add('trainings', 'rating', 'INTEGER');
    add('trainings', 'comment', 'TEXT');
    add('users', 'totp_secret', 'TEXT');
    add('users', 'totp_pending_secret', 'TEXT');
    add('users', 'totp_last_step', 'INTEGER');
    add('sessions', 'mfa_pending', 'INTEGER NOT NULL DEFAULT 0');
    add('sessions', 'mfa_attempts', 'INTEGER NOT NULL DEFAULT 0');
    db.prepare('INSERT OR IGNORE INTO migrations(version) VALUES(6)').run();
  })();

  // v7: apparatus. Every entry and routine belongs to an apparatus; the entry keeps the apparatus name
  // as part of its snapshot. All existing history was recorded on the trampoline.
  db.transaction(() => {
    const add = (table: string, column: string, definition: string) => { if (!columns(table).has(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`); };
    add('training_entries', 'apparatus_id', 'INTEGER');
    add('training_entries', 'apparatus_name', 'TEXT');
    add('routines', 'apparatus_id', 'INTEGER');
    if (!db.prepare('SELECT 1 FROM migrations WHERE version=7').get()) {
      for (const { id } of db.prepare('SELECT id FROM users').all() as { id: number }[]) seedApparatus(db, id);
      db.prepare(`UPDATE training_entries SET apparatus_id=(SELECT a.id FROM trainings t JOIN apparatus a ON a.user_id=t.user_id AND a.name='Trampolina'
        WHERE t.id=training_entries.training_id), apparatus_name='Trampolina' WHERE apparatus_id IS NULL`).run();
      db.prepare(`UPDATE routines SET apparatus_id=(SELECT a.id FROM apparatus a WHERE a.user_id=routines.user_id AND a.name='Trampolina') WHERE apparatus_id IS NULL`).run();
    }
    db.prepare('INSERT OR IGNORE INTO migrations(version) VALUES(7)').run();
  })();

  // v8: element catalogs. Elements get `catalog` (all existing ones: trampoline) and the code is unique
  // per catalog, which SQLite can only do by rebuilding the table (nothing references elements by a
  // foreign key; ids are kept, so routine items and training snapshots stay linked). Every user gets
  // the "Ścieżka" apparatus with the tumbling notation.
  db.transaction(() => {
    if (!columns('elements').has('catalog')) {
      db.exec(`CREATE TABLE elements_v8 (
        id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        code TEXT NOT NULL, name TEXT, favorite INTEGER NOT NULL DEFAULT 0,
        hidden INTEGER NOT NULL DEFAULT 0, deleted_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        quarter_count INTEGER, salto_count INTEGER, total_twist_halves INTEGER,
        direction TEXT, position_symbol TEXT,
        catalog TEXT NOT NULL DEFAULT 'trampoline' CHECK(catalog IN ('trampoline','tumbling')),
        UNIQUE(user_id, catalog, code));
        INSERT INTO elements_v8(id,user_id,code,name,favorite,hidden,deleted_at,created_at,quarter_count,salto_count,total_twist_halves,direction,position_symbol,catalog)
          SELECT id,user_id,code,name,favorite,hidden,deleted_at,created_at,quarter_count,salto_count,total_twist_halves,direction,position_symbol,'trampoline' FROM elements;
        DROP TABLE elements;
        ALTER TABLE elements_v8 RENAME TO elements;`);
    }
    if (!db.prepare('SELECT 1 FROM migrations WHERE version=8').get()) {
      for (const { id } of db.prepare('SELECT id FROM users').all() as { id: number }[]) addTumblingApparatus(db, id);
    }
    db.prepare('INSERT OR IGNORE INTO migrations(version) VALUES(8)').run();
  })();

  // v9: the same code may repeat with a different (optional) description, so the UNIQUE constraint
  // goes (again a rebuild, ids kept; the API checks code + description). Entries can be marked unfinished.
  db.transaction(() => {
    const uniqueOnElements = (db.prepare('PRAGMA index_list(elements)').all() as { unique: number; origin: string }[]).some(index => index.unique && index.origin === 'u');
    if (uniqueOnElements) {
      db.exec(`CREATE TABLE elements_v9 (
        id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        code TEXT NOT NULL, name TEXT, favorite INTEGER NOT NULL DEFAULT 0,
        hidden INTEGER NOT NULL DEFAULT 0, deleted_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        quarter_count INTEGER, salto_count INTEGER, total_twist_halves INTEGER,
        direction TEXT, position_symbol TEXT,
        catalog TEXT NOT NULL DEFAULT 'trampoline' CHECK(catalog IN ('trampoline','tumbling')));
        INSERT INTO elements_v9(id,user_id,code,name,favorite,hidden,deleted_at,created_at,quarter_count,salto_count,total_twist_halves,direction,position_symbol,catalog)
          SELECT id,user_id,code,name,favorite,hidden,deleted_at,created_at,quarter_count,salto_count,total_twist_halves,direction,position_symbol,catalog FROM elements;
        DROP TABLE elements;
        ALTER TABLE elements_v9 RENAME TO elements;`);
    }
    db.exec('CREATE INDEX IF NOT EXISTS idx_elements_user_code ON elements(user_id, catalog, code)');
    if (!columns('training_entries').has('unfinished')) db.exec('ALTER TABLE training_entries ADD COLUMN unfinished INTEGER NOT NULL DEFAULT 0');
    db.prepare('INSERT OR IGNORE INTO migrations(version) VALUES(9)').run();
  })();
}

/** "Ścieżka" with the tumbling notation, unless the user already has an apparatus of that name. */
function addTumblingApparatus(db: Db, userId: number): void {
  if (db.prepare("SELECT 1 FROM apparatus WHERE user_id=? AND name='Ścieżka'").get(userId)) return;
  const order = (db.prepare('SELECT COALESCE(MAX(sort_order),-1)+1 n FROM apparatus WHERE user_id=?').get(userId) as { n: number }).n;
  db.prepare("INSERT INTO apparatus(user_id,name,sort_order,catalog,tracks_time) VALUES(?,'Ścieżka',?,'tumbling',0)").run(userId, order);
}

/** Case- and normalization-insensitive form of a username, used for uniqueness and login. */
export function usernameKey(username: string): string {
  return username.normalize('NFC').toLowerCase();
}

/** Per-user defaults: landing places and apparatus. */
export function seedExecutionTypes(db: Db, userId: number): void {
  const insert = db.prepare('INSERT OR IGNORE INTO execution_types(user_id,name,sort_order) VALUES(?,?,?)');
  ['Siatka', 'Materac', 'Gąbki'].forEach((name, index) => insert.run(userId, name, index));
  seedApparatus(db, userId);
}

/** Default apparatus for a user without any: Trampolina (the default, with time), DMT, Ścieżka. */
export function seedApparatus(db: Db, userId: number): void {
  if (db.prepare('SELECT 1 FROM apparatus WHERE user_id=?').get(userId)) return;
  const insert = db.prepare('INSERT INTO apparatus(user_id,name,sort_order,catalog,tracks_time) VALUES(?,?,?,?,?)');
  insert.run(userId, 'Trampolina', 0, 'trampoline', 1);
  insert.run(userId, 'DMT', 1, 'trampoline', 0);
  insert.run(userId, 'Ścieżka', 2, 'tumbling', 0);
}

/** The first visible apparatus is the default one (seeding the defaults when the user has none). */
export function defaultApparatus(db: Db, userId: number): { id: number; name: string; catalog: 'trampoline' | 'tumbling' } {
  const pick = () => db.prepare('SELECT id,name,catalog FROM apparatus WHERE user_id=? AND deleted_at IS NULL ORDER BY hidden,sort_order,id LIMIT 1').get(userId) as { id: number; name: string; catalog: 'trampoline' | 'tumbling' } | undefined;
  let found = pick();
  if (!found) { seedApparatus(db, userId); found = pick(); }
  if (!found) throw new Error('Brak sprzętu. Dodaj sprzęt w profilu.');
  return found;
}
