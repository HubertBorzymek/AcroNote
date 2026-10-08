// Emergency account tool for the server (no web admin panel needed), e.g. on Fly.io:
//   fly ssh console -C "node apps/api/dist/admin-cli.js create-admin admin"
//   fly ssh console -C "node apps/api/dist/admin-cli.js reset-password \"Jan Kowalski\""
// Generated passwords are printed once and never stored in plain text.
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { openDatabase, resolveDatabasePath, seedExecutionTypes } from './db.js';

const [command, username] = process.argv.slice(2);
const usage = 'Użycie: node apps/api/dist/admin-cli.js <create-admin|reset-password|list-admins> [nazwa]';
const newPassword = () => randomBytes(12).toString('base64url');

const db = openDatabase();
try {
  console.log(`Baza: ${resolveDatabasePath()}`);
  if (command === 'list-admins') {
    for (const row of db.prepare("SELECT username,deleted_at deletedAt FROM users WHERE role='admin' ORDER BY username").all() as any[]) console.log(`- ${row.username}${row.deletedAt ? ' (usunięte)' : ''}`);
  } else if (command === 'create-admin' && username) {
    const existing = db.prepare('SELECT id,role FROM users WHERE username=?').get(username.normalize('NFC').trim()) as { id: number; role: string } | undefined;
    const password = newPassword();
    if (existing) {
      db.prepare("UPDATE users SET role='admin',deleted_at=NULL,password_hash=? WHERE id=?").run(await bcrypt.hash(password, 12), existing.id);
      db.prepare('DELETE FROM sessions WHERE user_id=?').run(existing.id);
      console.log(`Konto „${username}” istniało — nadano rolę administratora i ustawiono nowe hasło.`);
    } else {
      const id = Number(db.prepare("INSERT INTO users(username,password_hash,role) VALUES(?,?,'admin')").run(username.normalize('NFC').trim(), await bcrypt.hash(password, 12)).lastInsertRowid);
      seedExecutionTypes(db, id);
      console.log(`Utworzono administratora „${username}”.`);
    }
    console.log(`Hasło (pokazywane tylko raz): ${password}`);
  } else if (command === 'reset-password' && username) {
    const user = db.prepare('SELECT id FROM users WHERE username=?').get(username.normalize('NFC').trim()) as { id: number } | undefined;
    if (!user) { console.error(`Nie znaleziono konta „${username}”.`); process.exitCode = 1; }
    else {
      const password = newPassword();
      db.transaction(() => { db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(bcrypt.hashSync(password, 12), user.id); db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id); })();
      console.log(`Nowe hasło dla „${username}” (pokazywane tylko raz): ${password}\nWszystkie sesje tego konta zostały wylogowane.`);
    }
  } else { console.error(usage); process.exitCode = 1; }
} finally { db.close(); }
