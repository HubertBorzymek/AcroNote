// Emergency tool for administrator accounts, run on the server, e.g. on Fly.io:
//   fly ssh console -C "node apps/api/dist/admin-cli.js list-admins"
//   fly ssh console -C "node apps/api/dist/admin-cli.js grant-admin \"Jan Kowalski\""
// Users' passwords are never set here: they reset them themselves after an administrator approves the request.
// Generated administrator passwords are printed once and never stored in plain text.
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { clearTwoStep } from './accounts.js';
import { openDatabase, resolveDatabasePath, seedExecutionTypes, usernameKey } from './db.js';

const [command, ...rest] = process.argv.slice(2);
const username = rest.join(' ').normalize('NFC').trim();
const usage = `Użycie: node apps/api/dist/admin-cli.js <polecenie> [nazwa konta]
  list-admins                 lista administratorów
  grant-admin <nazwa>         nadaje rolę administratora istniejącemu kontu (hasło bez zmian)
  create-admin <nazwa>        zakłada nowe konto administratora z losowym hasłem
  reset-admin-password <nazwa> nowe losowe hasło dla konta administratora
  disable-2fa <nazwa>         wyłącza weryfikację dwuetapową (np. po utracie telefonu i kodów zapasowych)`;
const newPassword = () => randomBytes(12).toString('base64url');

const db = openDatabase();
try {
  console.log(`Baza: ${resolveDatabasePath()}`);
  const find = () => db.prepare('SELECT id,username,role FROM users WHERE username_key=? AND deleted_at IS NULL').get(usernameKey(username)) as { id: number; username: string; role: string } | undefined;
  const fail = (message: string) => { console.error(message); process.exitCode = 1; };
  if (command === 'list-admins') {
    for (const row of db.prepare("SELECT username,deleted_at deletedAt,totp_secret IS NOT NULL twoStep FROM users WHERE role='admin' ORDER BY username").all() as any[])
      console.log(`- ${row.username}${row.deletedAt ? ' (usunięte)' : ''}${row.twoStep ? '' : ' (bez weryfikacji dwuetapowej)'}`);
  } else if (!username) {
    fail(usage);
  } else if (command === 'grant-admin') {
    const user = find();
    if (!user) fail(`Nie znaleziono konta „${username}”.`);
    else { db.prepare("UPDATE users SET role='admin' WHERE id=?").run(user.id); console.log(`Konto „${user.username}” ma rolę administratora. Przy pierwszym wejściu do panelu ustawi weryfikację dwuetapową.`); }
  } else if (command === 'create-admin') {
    if (find()) fail(`Konto „${username}” już istnieje. Użyj grant-admin, żeby nie zmieniać jego hasła.`);
    else {
      const password = newPassword();
      const id = Number(db.prepare("INSERT INTO users(username,password_hash,role) VALUES(?,?,'admin')").run(username, await bcrypt.hash(password, 12)).lastInsertRowid);
      seedExecutionTypes(db, id);
      console.log(`Utworzono administratora „${username}”. Hasło (pokazywane tylko raz): ${password}`);
    }
  } else if (command === 'reset-admin-password') {
    const user = find();
    if (!user || user.role !== 'admin') fail(`Nie znaleziono konta administratora „${username}”. Zwykli użytkownicy resetują hasło przez prośbę z ekranu logowania.`);
    else {
      const password = newPassword();
      db.transaction(() => { db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(bcrypt.hashSync(password, 12), user.id); db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id); })();
      console.log(`Nowe hasło dla „${user.username}” (pokazywane tylko raz): ${password}\nWszystkie sesje tego konta zostały wylogowane.`);
    }
  } else if (command === 'disable-2fa') {
    const user = find();
    if (!user) fail(`Nie znaleziono konta „${username}”.`);
    else {
      clearTwoStep(db, user.id);
      db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id);
      console.log(`Wyłączono weryfikację dwuetapową dla „${user.username}”. Po zalogowaniu panel poprosi o jej ponowne ustawienie.`);
    }
  } else fail(usage);
} finally { db.close(); }
