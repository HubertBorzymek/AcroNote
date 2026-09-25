export const schema = `
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY, username TEXT NOT NULL COLLATE NOCASE UNIQUE,
  password_hash TEXT NOT NULL, athlete_enabled INTEGER NOT NULL DEFAULT 1,
  coach_enabled INTEGER NOT NULL DEFAULT 0, role TEXT NOT NULL DEFAULT 'user',
  deleted_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE, expires_at TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS execution_types (
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0, hidden INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT, UNIQUE(user_id, name)
);
CREATE TABLE IF NOT EXISTS elements (
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code TEXT NOT NULL, name TEXT, favorite INTEGER NOT NULL DEFAULT 0,
  hidden INTEGER NOT NULL DEFAULT 0, deleted_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  quarter_count INTEGER, salto_count INTEGER, total_twist_halves INTEGER,
  direction TEXT, position_symbol TEXT,
  UNIQUE(user_id, code)
);
CREATE TABLE IF NOT EXISTS routines (
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL, template_version INTEGER NOT NULL DEFAULT 1, slot_count INTEGER NOT NULL DEFAULT 10,
  deleted_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS routine_items (
  id INTEGER PRIMARY KEY, routine_id INTEGER NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
  position INTEGER NOT NULL, element_id INTEGER, code_snapshot TEXT NOT NULL, name_snapshot TEXT,
  UNIQUE(routine_id, position)
);
CREATE TABLE IF NOT EXISTS trainings (
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  training_date TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_trainings_user_date ON trainings(user_id, training_date);
CREATE TABLE IF NOT EXISTS training_entries (
  id INTEGER PRIMARY KEY, training_id INTEGER NOT NULL REFERENCES trainings(id) ON DELETE CASCADE,
  position INTEGER NOT NULL, default_execution_type_id INTEGER,
  default_execution_type_name TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS activities (
  id INTEGER PRIMARY KEY, entry_id INTEGER NOT NULL REFERENCES training_entries(id) ON DELETE CASCADE,
  position INTEGER NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('element','routine')),
  repetitions INTEGER NOT NULL CHECK(repetitions > 0), execution_type_id INTEGER,
  execution_type_name TEXT NOT NULL, source_element_id INTEGER, code_snapshot TEXT, name_snapshot TEXT,
  source_routine_id INTEGER, source_routine_name TEXT, source_template_version INTEGER,
  range_start INTEGER, range_end INTEGER, is_full_range INTEGER NOT NULL DEFAULT 0,
  matched_original_template INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS activity_elements (
  id INTEGER PRIMARY KEY, activity_id INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  position INTEGER NOT NULL, source_element_id INTEGER, code_snapshot TEXT NOT NULL, name_snapshot TEXT,
  execution_type_id INTEGER, execution_type_name TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS coach_links (
  id INTEGER PRIMARY KEY, athlete_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  coach_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, is_primary INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(athlete_id, coach_id), CHECK(athlete_id <> coach_id)
);
CREATE TABLE IF NOT EXISTS invitations (
  id INTEGER PRIMARY KEY, creator_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('athlete','coach')), token_hash TEXT NOT NULL UNIQUE,
  short_code_hash TEXT NOT NULL UNIQUE, expires_at TEXT NOT NULL, used_at TEXT
);
`;
