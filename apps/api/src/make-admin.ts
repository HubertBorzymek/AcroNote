import { openDatabase } from './db.js';

// Grants the admin role to an existing account, so a public deployment never needs an account with a known password.
const username = process.argv.slice(2).join(' ').normalize('NFC').trim();
if (!username) {
  console.error('Użycie: node make-admin.js <nazwa użytkownika>');
  process.exit(1);
}
const db = openDatabase();
const { changes } = db.prepare("UPDATE users SET role='admin' WHERE username=? AND deleted_at IS NULL").run(username);
db.close();
if (!changes) {
  console.error(`Nie znaleziono konta: ${username}`);
  process.exit(1);
}
console.log(`Konto ${username} ma teraz uprawnienia administratora.`);
