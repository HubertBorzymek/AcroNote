// Rebuilds the reporter's account from a bug report into the LOCAL database, to reproduce a problem.
//   npm run import-report -- C:\Pobrane\zgloszenie-12.json
// Accepts the JSON downloaded from the admin panel (or a bare data snapshot) and creates a new
// account "zgloszenie-<id>" with a random password. Original snapshot flags are preserved as-is.
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseElementCode } from '@acronote/shared';
import { openDatabase, resolveDatabasePath, type Db } from './db.js';
import { SNAPSHOT_FORMAT } from './bug-reports.js';

export async function importSnapshot(db: Db, snapshot: any, baseName: string): Promise<{ userId: number; username: string; password: string }> {
  if (snapshot?.format !== SNAPSHOT_FORMAT) throw new Error('Plik nie zawiera migawki danych AcroNote (zgłoszenie bez migawki?).');
  let username = baseName; for (let n = 2; db.prepare('SELECT 1 FROM users WHERE username=?').get(username); n++) username = `${baseName}-${n}`;
  const password = randomBytes(9).toString('base64url');
  const hash = await bcrypt.hash(password, 10);
  const userId = db.transaction(() => {
    const userId = Number(db.prepare('INSERT INTO users(username,password_hash,athlete_enabled,coach_enabled) VALUES(?,?,?,?)')
      .run(username, hash, snapshot.user?.athleteEnabled === false ? 0 : 1, snapshot.user?.coachEnabled ? 1 : 0).lastInsertRowid);
    const types = new Map<number, number>(); const elements = new Map<number, number>(); const routines = new Map<number, number>();
    const mapped = (map: Map<number, number>, id: unknown) => id == null ? null : map.get(Number(id)) ?? null;
    for (const t of snapshot.executionTypes ?? []) types.set(t.id, Number(db.prepare('INSERT INTO execution_types(user_id,name,sort_order,hidden,deleted_at) VALUES(?,?,?,?,?)').run(userId, t.name, t.sortOrder ?? 0, t.hidden ? 1 : 0, t.deletedAt ?? null).lastInsertRowid));
    for (const e of snapshot.elements ?? []) {
      const p = parseElementCode(e.code);
      elements.set(e.id, Number(db.prepare('INSERT INTO elements(user_id,code,name,favorite,hidden,deleted_at,quarter_count,salto_count,total_twist_halves,direction,position_symbol) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
        .run(userId, e.code, e.name ?? null, e.favorite ? 1 : 0, e.hidden ? 1 : 0, e.deletedAt ?? null, p?.quarterCount ?? null, p?.saltoCount ?? null, p?.totalTwistHalves ?? null, p?.direction ?? null, p?.positionSymbol ?? null).lastInsertRowid));
    }
    for (const r of snapshot.routines ?? []) {
      const id = Number(db.prepare('INSERT INTO routines(user_id,name,template_version,slot_count,deleted_at) VALUES(?,?,?,?,?)').run(userId, r.name, r.templateVersion ?? 1, r.slotCount ?? 10, r.deletedAt ?? null).lastInsertRowid);
      routines.set(r.id, id);
      for (const item of r.items ?? []) db.prepare('INSERT INTO routine_items(routine_id,position,element_id,code_snapshot,name_snapshot) VALUES(?,?,?,?,?)').run(id, item.position, mapped(elements, item.elementId), item.code, item.name ?? null);
    }
    const addActivity = db.prepare(`INSERT INTO activities(entry_id,position,kind,repetitions,execution_type_id,execution_type_name,source_element_id,code_snapshot,name_snapshot,
      source_routine_id,source_routine_name,source_template_version,range_start,range_end,is_full_range,matched_original_template) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    const addElement = db.prepare('INSERT INTO activity_elements(activity_id,position,source_element_id,code_snapshot,name_snapshot,execution_type_id,execution_type_name) VALUES(?,?,?,?,?,?,?)');
    for (const t of snapshot.trainings ?? []) {
      if (!t) continue;
      const trainingId = Number(db.prepare('INSERT INTO trainings(user_id,training_date,created_at,updated_at) VALUES(?,?,?,?)').run(userId, t.date, t.createdAt, t.updatedAt).lastInsertRowid);
      for (const entry of t.entries ?? []) {
        const entryId = Number(db.prepare('INSERT INTO training_entries(training_id,position,default_execution_type_id,default_execution_type_name) VALUES(?,?,?,?)').run(trainingId, entry.position, mapped(types, entry.defaultExecutionTypeId), entry.defaultExecutionTypeName).lastInsertRowid);
        for (const a of entry.activities ?? []) {
          const activityId = Number(addActivity.run(entryId, a.position, a.kind, a.repetitions, mapped(types, a.executionTypeId), a.executionTypeName, mapped(elements, a.sourceElementId), a.code ?? null, a.name ?? null,
            mapped(routines, a.sourceRoutineId), a.sourceRoutineName ?? null, a.sourceTemplateVersion ?? null, a.rangeStart ?? null, a.rangeEnd ?? null, a.isFullRange ? 1 : 0, a.matchedOriginalTemplate ? 1 : 0).lastInsertRowid);
          for (const el of a.elements ?? []) addElement.run(activityId, el.position, mapped(elements, el.sourceElementId), el.code, el.name ?? null, mapped(types, el.executionTypeId), el.executionTypeName);
        }
      }
    }
    return userId;
  })();
  return { userId, username, password };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const file = process.argv[2];
  if (!file) { console.error('Użycie: npm run import-report -- <plik-zgloszenia.json>'); process.exit(1); }
  if (process.env.ACRONOTE_ENV === 'production') { console.error('Import zgłoszeń jest przeznaczony wyłącznie dla lokalnej bazy.'); process.exit(1); }
  const path = resolve(process.env.INIT_CWD ?? process.cwd(), file);
  if (!existsSync(path)) { console.error(`Nie znaleziono pliku: ${path}`); process.exit(1); }
  const report = JSON.parse(readFileSync(path, 'utf8'));
  const snapshot = report.dataSnapshot ?? report;
  const db = openDatabase();
  try {
    const result = await importSnapshot(db, snapshot, `zgloszenie-${report.id ?? 'import'}`);
    console.log(`Baza: ${resolveDatabasePath()}`);
    console.log(`Zaimportowano dane ${snapshot.user?.username ?? 'zgłaszającego'}: ${snapshot.elements?.length ?? 0} elementów, ${snapshot.routines?.length ?? 0} układów, ${snapshot.trainings?.length ?? 0} treningów.`);
    if (report.description) console.log(`Opis zgłoszenia: ${report.description}`);
    if (report.page) console.log(`Strona w chwili zgłoszenia: ${report.page}`);
    console.log(`Zaloguj się lokalnie jako: ${result.username} / ${result.password}`);
  } finally { db.close(); }
}
