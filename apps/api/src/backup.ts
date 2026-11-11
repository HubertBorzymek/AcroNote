import Database from 'better-sqlite3';
import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Writes a consistent copy of the database (VACUUM INTO also captures WAL contents) to
 * `<dir>/acronote-<timestamp>-<version>.db` and keeps only the newest `keep` copies.
 * Returns the path of the new copy, or null when there is nothing to back up yet.
 */
export function backupDatabase(dbPath: string, dir: string, version: string, keep = 14): string | null {
  if (dbPath === ':memory:' || !existsSync(dbPath)) return null;
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const target = join(dir, `acronote-${stamp}-${version.replace(/[^\w.-]/g, '_')}.db`);
  const source = new Database(dbPath, { fileMustExist: true });
  try { source.prepare('VACUUM INTO ?').run(target); } finally { source.close(); }
  for (const old of listBackups(dir).slice(keep)) rmSync(join(dir, old), { force: true });
  return target;
}

/** Newest first. */
export function listBackups(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(name => /^acronote-.*\.db$/.test(name)).sort().reverse();
}

/** Backs up when this version has no copy yet (i.e. before its migrations ran) or the newest copy is a day old. */
export function backupIfDue(dbPath: string, dir: string, version: string): string | null {
  const backups = listBackups(dir);
  const tag = `-${version.replace(/[^\w.-]/g, '_')}.db`;
  const newest = backups[0];
  const stale = !newest || Date.now() - statSync(join(dir, newest)).mtimeMs > DAY_MS;
  return stale || !backups.some(name => name.endsWith(tag)) ? backupDatabase(dbPath, dir, version) : null;
}
