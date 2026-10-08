// Builds a self-contained Windows package: release/AcroNote + release/AcroNote-<version>-win-x64.zip.
// It bundles the node.exe matching the Node version running this script, so the native
// better-sqlite3 binary installed here is guaranteed to fit the bundled runtime.
// Usage (after `npm run build`): node scripts/package-release.mjs
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const releaseDir = join(root, 'release');
const out = join(releaseDir, 'AcroNote');
const readJson = (path) => JSON.parse(readFileSync(join(root, path), 'utf8'));
const version = (process.env.RELEASE_VERSION || readJson('package.json').version).replace(/^v/, '');
const zipPath = join(releaseDir, `AcroNote-${version}-win-x64.zip`);

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', shell: process.platform === 'win32', ...options });
  if (result.status !== 0) throw new Error(`Polecenie nie powiodło się: ${command} ${args.join(' ')}`);
}

if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('Paczkę win-x64 trzeba budować na Windows x64.');
for (const path of ['apps/api/dist/server.js', 'packages/web/dist/index.html', 'packages/shared/dist/index.js']) {
  if (!existsSync(join(root, path))) throw new Error(`Brak ${path}. Uruchom najpierw: npm run build`);
}

rmSync(out, { recursive: true, force: true });
rmSync(zipPath, { force: true });
mkdirSync(out, { recursive: true });

// Application code, in the same layout as the repository (paths in db.ts/app.ts rely on it).
cpSync(join(root, 'apps/api/dist'), join(out, 'apps/api/dist'), { recursive: true });
writeFileSync(join(out, 'apps/api/package.json'), JSON.stringify({ type: 'module', private: true }, null, 2));
cpSync(join(root, 'packages/web/dist'), join(out, 'packages/web/dist'), { recursive: true });

// Production dependencies of the API, pinned to the versions from package-lock.json.
const lock = readJson('package-lock.json');
const dependencies = Object.fromEntries(Object.keys(readJson('apps/api/package.json').dependencies)
  .filter((name) => !name.startsWith('@acronote/'))
  .map((name) => [name, lock.packages[`node_modules/${name}`]?.version ?? readJson('apps/api/package.json').dependencies[name]]));
writeFileSync(join(out, 'package.json'), JSON.stringify({ name: 'acronote-release', version, private: true, dependencies }, null, 2));
run('npm install --omit=dev --no-audit --no-fund', [], { cwd: out });
const shared = join(out, 'node_modules/@acronote/shared');
cpSync(join(root, 'packages/shared/dist'), join(shared, 'dist'), { recursive: true });
cpSync(join(root, 'packages/shared/package.json'), join(shared, 'package.json'));

// Bundled Node.js runtime, verified against the official checksums.
const cache = join(releaseDir, '.cache', process.version);
const nodeExe = join(cache, 'node.exe');
if (!existsSync(nodeExe)) {
  const base = `https://nodejs.org/dist/${process.version}`;
  console.log(`Pobieranie ${base}/win-x64/node.exe`);
  const [binary, sums] = await Promise.all([
    fetch(`${base}/win-x64/node.exe`).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.arrayBuffer(); }),
    fetch(`${base}/SHASUMS256.txt`).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.text(); }),
  ]);
  const expected = sums.split('\n').find((line) => line.trim().endsWith('win-x64/node.exe'))?.split(/\s+/)[0];
  const actual = createHash('sha256').update(Buffer.from(binary)).digest('hex');
  if (!expected || expected !== actual) throw new Error('Suma kontrolna node.exe się nie zgadza.');
  mkdirSync(cache, { recursive: true });
  writeFileSync(nodeExe, Buffer.from(binary));
}
cpSync(nodeExe, join(out, 'node/node.exe'));

cpSync(join(root, 'scripts/release/AcroNote.bat'), join(out, 'AcroNote.bat'));
cpSync(join(root, 'scripts/release/CZYTAJ_MNIE.txt'), join(out, 'CZYTAJ_MNIE.txt'));
writeFileSync(join(out, '.env.example'), [
  '# Skopiuj ten plik jako .env, aby zmienić ustawienia.',
  'PORT=3001',
  'HOST=127.0.0.1',
  '# Domyślnie dane są w %LOCALAPPDATA%\\AcroNote. Odkomentuj, aby wskazać inny plik bazy:',
  '# DATABASE_PATH=D:\\Dane\\acronote.db',
  '# Ustaw 0, aby nowa baza nie dostawała kont demo:',
  '# ACRONOTE_DEMO=0',
  '',
].join('\r\n'));

// Smoke test: the bundled runtime must load the native SQLite module and the server code.
run(join(out, 'node/node.exe'), ['-e', "require('better-sqlite3')(':memory:').close();import('@acronote/shared').then(()=>console.log('Smoke test OK'))"], { cwd: out, shell: false });

// Windows' bundled tar.exe can crash while writing ZIPs, so use .NET's ZipFile instead.
const psQuote = (value) => `'${value.replaceAll("'", "''")}'`;
run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
  `Add-Type -AssemblyName System.IO.Compression.FileSystem; [IO.Compression.ZipFile]::CreateFromDirectory(${psQuote(out)}, ${psQuote(zipPath)}, 'Optimal', $true)`], { shell: false });
console.log(`Gotowe: ${zipPath}`);
