import { defaultApparatus, type Db } from './db.js';

type SnapshotElement = { sourceElementId?: number | null; code: string; name?: string | null; executionTypeId?: number | null; executionTypeName?: string; position?: number; timeMs?: number | null };
type Activity = {
  kind: 'element' | 'routine'; repetitions: number; executionTypeId?: number | null; executionTypeName?: string;
  sourceElementId?: number | null; code?: string; name?: string | null;
  sourceRoutineId?: number | null; sourceRoutineName?: string; sourceTemplateVersion?: number;
  rangeStart?: number; rangeEnd?: number; isFullRange?: boolean; elements?: SnapshotElement[];
  /** Time of a single execution in milliseconds: the element, or the whole routine/fragment. */
  timeMs?: number | null;
};
export type TrainingInput = {
  date: string; entries: { defaultExecutionTypeId?: number | null; defaultExecutionTypeName?: string; apparatusId?: number | null; apparatusName?: string; activities: Activity[] }[];
  /** Private to the athlete: never returned to coaches or administrators. Omitted = keep the stored value. */
  rating?: number | null; comment?: string | null;
};
export type TrainingAccess = { includePrivate?: boolean };

/** Longest accepted time of one execution (10 min); times are stored as whole milliseconds. */
export const MAX_TIME_MS = 600_000;
const ONE_EXECUTION_ONLY = 'Czas można wpisać tylko dla pojedynczego wykonania (×1). Rozdziel powtórzenia na osobne pozycje.';

function timeValue(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > MAX_TIME_MS) throw new Error('Czas musi być dodatni, w tysięcznych sekundy, i nie dłuższy niż 10 minut.');
  return value;
}

function ratingValue(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 10) throw new Error('Ocena treningu musi być liczbą od 1 do 10.');
  return value;
}

function commentValue(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw new Error('Komentarz jest nieprawidłowy.');
  const trimmed = value.trim();
  if (trimmed.length > 2000) throw new Error('Komentarz może mieć najwyżej 2000 znaków.');
  return trimmed || null;
}

function requiredText(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} jest wymagane.`);
  return value.trim();
}

function isCalendarDate(value: string): boolean {
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}

/** `includePrivate` (only the athlete) allows changing the rating and comment; otherwise they stay untouched. */
export function saveTraining(db: Db, userId: number, input: TrainingInput, trainingId?: number, access: TrainingAccess = {}): number {
  if (typeof input?.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input.date) || !isCalendarDate(input.date)) throw new Error('Nieprawidłowa data treningu.');
  if (!Array.isArray(input.entries) || input.entries.some(entry => !Array.isArray(entry?.activities))) throw new Error('Nieprawidłowa struktura treningu.');
  const setPrivate = Boolean(access.includePrivate) && ('rating' in input || 'comment' in input);
  const rating = setPrivate ? ratingValue(input.rating) : null;
  const comment = setPrivate ? commentValue(input.comment) : null;
  const transaction = db.transaction(() => {
    let id = trainingId;
    if (id) {
      const owned = db.prepare('SELECT id FROM trainings WHERE id=? AND user_id=?').get(id, userId);
      if (!owned) throw new Error('Nie znaleziono treningu.');
      db.prepare("UPDATE trainings SET training_date=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(input.date, id);
      if (setPrivate) db.prepare('UPDATE trainings SET rating=?,comment=? WHERE id=?').run(rating, comment, id);
      db.prepare('DELETE FROM training_entries WHERE training_id=?').run(id);
    } else {
      id = Number(db.prepare('INSERT INTO trainings(user_id,training_date,rating,comment) VALUES(?,?,?,?)').run(userId, input.date, rating, comment).lastInsertRowid);
    }
    const addEntry = db.prepare('INSERT INTO training_entries(training_id,position,default_execution_type_id,default_execution_type_name,apparatus_id,apparatus_name) VALUES(?,?,?,?,?,?)');
    const ownApparatus = db.prepare('SELECT id,name FROM apparatus WHERE id=? AND user_id=?');
    const addActivity = db.prepare(`INSERT INTO activities(entry_id,position,kind,repetitions,execution_type_id,execution_type_name,
      source_element_id,code_snapshot,name_snapshot,source_routine_id,source_routine_name,source_template_version,
      range_start,range_end,is_full_range,matched_original_template,time_ms) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    const addElement = db.prepare(`INSERT INTO activity_elements(activity_id,position,source_element_id,code_snapshot,name_snapshot,
      execution_type_id,execution_type_name,time_ms) VALUES(?,?,?,?,?,?,?,?)`);
    input.entries.forEach((entry, entryIndex) => {
      const defaultName = requiredText(entry.defaultExecutionTypeName ?? 'Siatka', 'Miejsce lądowania');
      // The apparatus must belong to this user; its name is kept in the entry snapshot (like the landing place).
      let apparatus = defaultApparatus(db, userId);
      if (entry.apparatusId != null) {
        const owned = ownApparatus.get(entry.apparatusId, userId) as { id: number; name: string } | undefined;
        if (!owned) throw new Error('Wybrany sprzęt nie istnieje.');
        apparatus = owned;
      }
      const apparatusName = typeof entry.apparatusName === 'string' && entry.apparatusName.trim() && entry.apparatusId != null ? entry.apparatusName.trim() : apparatus.name;
      const entryId = Number(addEntry.run(id, entryIndex, entry.defaultExecutionTypeId ?? null, defaultName, apparatus.id, apparatusName).lastInsertRowid);
      entry.activities.forEach((activity, activityIndex) => {
        if (!Number.isInteger(activity.repetitions) || activity.repetitions < 1) throw new Error('Liczba powtórzeń musi być dodatnią liczbą całkowitą.');
        const activityTime = timeValue(activity.timeMs);
        const elementTimes = activity.kind === 'routine' ? (activity.elements ?? []).map(element => timeValue(element.timeMs)) : [];
        if (activity.repetitions !== 1 && (activityTime !== null || elementTimes.some(time => time !== null))) throw new Error(ONE_EXECUTION_ONLY);
        const executionName = requiredText(activity.executionTypeName ?? defaultName, 'Miejsce lądowania');
        let matched = activity.kind === 'element';
        let templateVersion: number | null = null;
        if (activity.kind === 'routine') {
          if (!activity.elements?.length) throw new Error('Wykonanie układu musi zawierać elementy.');
          if (activity.sourceRoutineId) {
            const routine = db.prepare('SELECT template_version FROM routines WHERE id=? AND user_id=?').get(activity.sourceRoutineId, userId) as { template_version: number } | undefined;
            templateVersion = activity.sourceTemplateVersion ?? routine?.template_version ?? null;
          }
          matched = Boolean(activity.isFullRange) && matchesCurrentSnapshot(db, userId, activity);
        }
        const result = addActivity.run(entryId, activityIndex, activity.kind, activity.repetitions,
          activity.executionTypeId ?? entry.defaultExecutionTypeId ?? null, executionName,
          activity.kind === 'element' ? activity.sourceElementId ?? null : null,
          activity.kind === 'element' ? requiredText(activity.code, 'Kod elementu') : null,
          activity.kind === 'element' ? activity.name ?? null : null,
          activity.kind === 'routine' ? activity.sourceRoutineId ?? null : null,
          activity.kind === 'routine' ? requiredText(activity.sourceRoutineName, 'Nazwa układu') : null,
          templateVersion, activity.kind === 'routine' ? activity.rangeStart ?? 1 : null,
          activity.kind === 'routine' ? activity.rangeEnd ?? activity.elements!.length : null,
          activity.kind === 'routine' && activity.isFullRange ? 1 : 0, matched ? 1 : 0, activityTime);
        const activityId = Number(result.lastInsertRowid);
        if (activity.kind === 'routine') activity.elements!.forEach((element, elementIndex) => {
          addElement.run(activityId, element.position ?? elementIndex + 1, element.sourceElementId ?? null,
            requiredText(element.code, 'Kod elementu'), element.name ?? null,
            element.executionTypeId ?? activity.executionTypeId ?? entry.defaultExecutionTypeId ?? null,
            requiredText(element.executionTypeName ?? executionName, 'Miejsce lądowania'), elementTimes[elementIndex] ?? null);
        });
      });
    });
    return id;
  });
  return transaction();
}

function matchesCurrentSnapshot(db: Db, userId: number, activity: Activity): boolean {
  if (!activity.sourceRoutineId || !activity.elements) return false;
  const items = db.prepare(`SELECT ri.position,COALESCE(e.code,ri.code_snapshot) code,COALESCE(e.name,ri.name_snapshot) name
    FROM routines r JOIN routine_items ri ON ri.routine_id=r.id LEFT JOIN elements e ON e.id=ri.element_id AND e.user_id=r.user_id
    WHERE r.id=? AND r.user_id=? ORDER BY ri.position`).all(activity.sourceRoutineId, userId) as { position:number; code:string; name:string|null }[];
  return items.length === activity.elements.length && items.every((item, index) => item.code === activity.elements![index]?.code && (item.name ?? null) === (activity.elements![index]?.name ?? null));
}

/** Coaches, administrators and bug-report snapshots read without `includePrivate`, so they never see the rating or comment. */
export function getTraining(db: Db, userId: number, id: number, access: TrainingAccess = {}) {
  const training = db.prepare(`SELECT id,training_date date,created_at createdAt,updated_at updatedAt${access.includePrivate ? ',rating,comment' : ''} FROM trainings WHERE id=? AND user_id=?`).get(id, userId) as any;
  if (!training) return null;
  training.entries = db.prepare('SELECT id,position,default_execution_type_id defaultExecutionTypeId,default_execution_type_name defaultExecutionTypeName,apparatus_id apparatusId,apparatus_name apparatusName FROM training_entries WHERE training_id=? ORDER BY position').all(id) as any[];
  for (const entry of training.entries) {
    entry.activities = db.prepare(`SELECT id,position,kind,repetitions,execution_type_id executionTypeId,execution_type_name executionTypeName,
      source_element_id sourceElementId,code_snapshot code,name_snapshot name,source_routine_id sourceRoutineId,
      source_routine_name sourceRoutineName,source_template_version sourceTemplateVersion,range_start rangeStart,range_end rangeEnd,
      is_full_range isFullRange,matched_original_template matchedOriginalTemplate,time_ms timeMs FROM activities WHERE entry_id=? ORDER BY position`).all(entry.id) as any[];
    for (const activity of entry.activities) if (activity.kind === 'routine') activity.elements = db.prepare(`SELECT position,source_element_id sourceElementId,
      code_snapshot code,name_snapshot name,execution_type_id executionTypeId,execution_type_name executionTypeName,time_ms timeMs
      FROM activity_elements WHERE activity_id=? ORDER BY position`).all(activity.id);
  }
  return training;
}

/** `apparatusId` limits everything to entries on that apparatus (statistics are kept per apparatus). */
export function trainingSummary(db: Db, userId: number, from?: string, to?: string, elementId?: number, apparatusId?: number) {
  const conditions = ['t.user_id=?']; const values: unknown[] = [userId];
  if (from) { conditions.push('t.training_date>=?'); values.push(from); }
  if (to) { conditions.push('t.training_date<=?'); values.push(to); }
  const where = conditions.join(' AND ');
  const onApparatus = apparatusId === undefined ? '' : ' AND te.apparatus_id=?';
  const apparatusValues = apparatusId === undefined ? [] : [apparatusId];
  const trainings = db.prepare(apparatusId === undefined
    ? `SELECT t.id,t.training_date date,COUNT(DISTINCT te.id) entries FROM trainings t LEFT JOIN training_entries te ON te.training_id=t.id WHERE ${where} GROUP BY t.id ORDER BY t.training_date`
    : `SELECT t.id,t.training_date date,COUNT(DISTINCT te.id) entries FROM trainings t JOIN training_entries te ON te.training_id=t.id WHERE ${where}${onApparatus} GROUP BY t.id ORDER BY t.training_date`).all(...values, ...apparatusValues) as any[];
  const activityRows = db.prepare(`SELECT a.id,a.kind,a.repetitions,a.is_full_range,a.matched_original_template,a.source_routine_name,
    a.source_element_id,a.code_snapshot,a.execution_type_name FROM trainings t JOIN training_entries te ON te.training_id=t.id JOIN activities a ON a.entry_id=te.id WHERE ${where}${onApparatus}`).all(...values, ...apparatusValues) as any[];
  const ids = activityRows.map(row => row.id);
  const snapshotRows = ids.length ? db.prepare(`SELECT ae.activity_id,ae.source_element_id,ae.code_snapshot code,ae.execution_type_name,a.repetitions FROM activity_elements ae JOIN activities a ON a.id=ae.activity_id WHERE ae.activity_id IN (${ids.map(()=>'?').join(',')})`).all(...ids) as any[] : [];
  const byCode: Record<string, number> = {};
  const landingTotals = new Map<string, number>();
  const landingCodes = new Map<string, Map<string, number>>();
  const addLanding = (code: string, name: string, repetitions: number) => {
    landingTotals.set(name, (landingTotals.get(name) ?? 0) + repetitions);
    const codeLandings = landingCodes.get(code) ?? new Map<string, number>();
    codeLandings.set(name, (codeLandings.get(name) ?? 0) + repetitions);
    landingCodes.set(code, codeLandings);
  };
  for (const row of activityRows) if (row.kind === 'element') {
    byCode[row.code_snapshot] = (byCode[row.code_snapshot] ?? 0) + row.repetitions;
    if(elementId===undefined||row.source_element_id===elementId)addLanding(row.code_snapshot, row.execution_type_name, row.repetitions);
  }
  for (const row of snapshotRows) {
    byCode[row.code] = (byCode[row.code] ?? 0) + row.repetitions;
    if(elementId===undefined||row.source_element_id===elementId)addLanding(row.code, row.execution_type_name, row.repetitions);
  }
  let totalElements = Object.values(byCode).reduce((sum, count) => sum + count, 0);
  for (const training of trainings) {
    const rows=db.prepare(`SELECT a.kind,a.repetitions,a.code_snapshot FROM training_entries te JOIN activities a ON a.entry_id=te.id WHERE te.training_id=?${onApparatus}`).all(training.id,...apparatusValues) as any[];
    const routineIds=db.prepare(`SELECT a.id,a.repetitions FROM training_entries te JOIN activities a ON a.entry_id=te.id WHERE te.training_id=?${onApparatus} AND a.kind='routine'`).all(training.id,...apparatusValues) as any[];
    const direct=elementId===undefined?rows.filter(r=>r.kind==='element').reduce((s,r)=>s+r.repetitions,0):
      Number((db.prepare(`SELECT COALESCE(SUM(a.repetitions),0) count FROM training_entries te JOIN activities a ON a.entry_id=te.id WHERE te.training_id=?${onApparatus} AND a.kind='element' AND a.source_element_id=?`).get(training.id,...apparatusValues,elementId) as any).count);
    const nested=elementId===undefined?routineIds.reduce((sum,r)=>sum+(db.prepare('SELECT COUNT(*) count FROM activity_elements WHERE activity_id=?').get(r.id) as any).count*r.repetitions,0):
      Number((db.prepare(`SELECT COALESCE(SUM(a.repetitions),0) count FROM training_entries te JOIN activities a ON a.entry_id=te.id JOIN activity_elements ae ON ae.activity_id=a.id WHERE te.training_id=?${onApparatus} AND ae.source_element_id=?`).get(training.id,...apparatusValues,elementId) as any).count);
    training.totalElements=direct+nested;
  }
  if(elementId!==undefined){
    totalElements=trainings.reduce((sum,row)=>sum+row.totalElements,0);
    const element=db.prepare('SELECT code FROM elements WHERE id=? AND user_id=?').get(elementId,userId) as {code:string}|undefined;
    for(const code of Object.keys(byCode))delete byCode[code];
    if(element)byCode[element.code]=totalElements;
  }
  const timelineByDate = new Map<string, { date: string; entries: number; totalElements: number }>();
  for (const training of trainings) {
    const point = timelineByDate.get(training.date) ?? { date: training.date, entries: 0, totalElements: 0 };
    point.entries += Number(training.entries);
    point.totalElements += Number(training.totalElements);
    timelineByDate.set(training.date, point);
  }
  return {
    trainings: trainings.length, entries: trainings.reduce((sum,row)=>sum+row.entries,0), totalElements, byCode,
    byLanding: [...landingTotals.entries()].map(([name,count])=>({name,count})).sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name,'pl')),
    landingByCode: [...landingCodes.entries()].map(([code,landings])=>({code,landings:[...landings.entries()].map(([name,count])=>({name,count})).sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name,'pl'))})).sort((a,b)=>a.code.localeCompare(b.code)),
    fullRoutines: activityRows.filter(row=>row.kind==='routine' && row.is_full_range).reduce((sum,row)=>sum+row.repetitions,0),
    matchingFullRoutines: activityRows.filter(row=>row.kind==='routine' && row.is_full_range && row.matched_original_template).reduce((sum,row)=>sum+row.repetitions,0),
    fragments: activityRows.filter(row=>row.kind==='routine' && !row.is_full_range).reduce((sum,row)=>sum+row.repetitions,0),
    timeline: [...timelineByDate.values()]
  };
}
