import type { Db } from './db.js';

// Time statistics read only saved training snapshots (code, routine name and range as they were then).
// A longer time is better (time in the air), so the record is the longest time.

// Keys include the apparatus: a back somersault on the trampoline and on the DMT are separate records.
// A combo ("Połączenie") has no name: it is identified by its codes in order, e.g. "( F 2.".
type Measurement = { key: string; kind: 'element' | 'routine' | 'combo'; label: string; elementId: number | null; name: string | null; apparatusId: number | null; apparatusName: string | null; trainingId: number; date: string; timeMs: number };

const RECENT_DAYS = 30;

function measurements(db: Db, userId: number, from?: string, to?: string, trainingId?: number, apparatusId?: number, finishedOnly = false): Measurement[] {
  const conditions = ['t.user_id=?']; const values: unknown[] = [userId];
  if (from) { conditions.push('t.training_date>=?'); values.push(from); }
  if (to) { conditions.push('t.training_date<=?'); values.push(to); }
  if (trainingId !== undefined) { conditions.push('t.id=?'); values.push(trainingId); }
  if (apparatusId !== undefined) { conditions.push('te.apparatus_id=?'); values.push(apparatusId); }
  if (finishedOnly) conditions.push('te.unfinished=0');
  const where = conditions.join(' AND ');
  const rows = db.prepare(`
    SELECT 'element' kind,a.code_snapshot code,NULL routine,NULL rangeStart,NULL rangeEnd,0 isFull,t.id trainingId,t.training_date date,a.time_ms timeMs,te.apparatus_id apparatusId,te.apparatus_name apparatusName,a.source_element_id elementId,a.name_snapshot name
      FROM trainings t JOIN training_entries te ON te.training_id=t.id JOIN activities a ON a.entry_id=te.id
      WHERE ${where} AND a.kind='element' AND a.time_ms IS NOT NULL
    UNION ALL
    SELECT 'element',ae.code_snapshot,NULL,NULL,NULL,0,t.id,t.training_date,ae.time_ms,te.apparatus_id,te.apparatus_name,ae.source_element_id,ae.name_snapshot
      FROM trainings t JOIN training_entries te ON te.training_id=t.id JOIN activities a ON a.entry_id=te.id JOIN activity_elements ae ON ae.activity_id=a.id
      WHERE ${where} AND ae.time_ms IS NOT NULL
    UNION ALL
    SELECT 'routine',NULL,a.source_routine_name,a.range_start,a.range_end,a.is_full_range,t.id,t.training_date,a.time_ms,te.apparatus_id,te.apparatus_name,NULL,NULL
      FROM trainings t JOIN training_entries te ON te.training_id=t.id JOIN activities a ON a.entry_id=te.id
      WHERE ${where} AND a.kind='routine' AND a.time_ms IS NOT NULL`).all(...values, ...values, ...values) as any[];
  const combos = db.prepare(`SELECT a.id,t.id trainingId,t.training_date date,a.time_ms timeMs,te.apparatus_id apparatusId,te.apparatus_name apparatusName
    FROM trainings t JOIN training_entries te ON te.training_id=t.id JOIN activities a ON a.entry_id=te.id
    WHERE ${where} AND a.kind='combo' AND a.time_ms IS NOT NULL`).all(...values) as any[];
  const comboCodes = db.prepare('SELECT code_snapshot code FROM activity_elements WHERE activity_id=? ORDER BY position,id');
  const comboMeasurements: Measurement[] = combos.map(row => {
    const label = (comboCodes.all(row.id) as { code: string }[]).map(item => item.code).join(' ');
    return { key: `${row.apparatusId ?? '-'}:combo:${label}`, kind: 'combo', label, elementId: null, name: null, apparatusId: row.apparatusId ?? null, apparatusName: row.apparatusName ?? null, trainingId: row.trainingId, date: row.date, timeMs: row.timeMs };
  });
  return [...comboMeasurements, ...rows.map((row): Measurement => {
    const apparatus = { apparatusId: row.apparatusId ?? null, apparatusName: row.apparatusName ?? null };
    return row.kind === 'element'
      // Per element id, so variants with the same code (e.g. 40o from the back) keep separate records.
      ? { key: `${row.apparatusId ?? '-'}:element:${row.elementId != null ? `#${row.elementId}` : row.code}`, kind: 'element' as const, label: String(row.code), elementId: row.elementId ?? null, name: row.name ?? null, ...apparatus, trainingId: row.trainingId, date: row.date, timeMs: row.timeMs }
      : { key: `${row.apparatusId ?? '-'}:routine:${row.routine}|${row.isFull ? 'full' : `${row.rangeStart}-${row.rangeEnd}`}`, kind: 'routine' as const,
          label: row.isFull ? String(row.routine) : `${row.routine} (poz. ${row.rangeStart}–${row.rangeEnd})`, elementId: null, name: null, ...apparatus, trainingId: row.trainingId, date: row.date, timeMs: row.timeMs };
  })];
}

const average = (values: number[]) => values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;

export function timeStats(db: Db, userId: number, from?: string, to?: string, today = new Date(), apparatusId?: number, finishedOnly = false) {
  const recentFrom = new Date(today.getTime() - RECENT_DAYS * 86_400_000).toISOString().slice(0, 10);
  const groups = new Map<string, Measurement[]>();
  for (const item of measurements(db, userId, from, to, undefined, apparatusId, finishedOnly)) groups.set(item.key, [...(groups.get(item.key) ?? []), item]);
  const items = [...groups.entries()].map(([key, list]) => {
    const best = list.reduce((top, item) => item.timeMs > top.timeMs || (item.timeMs === top.timeMs && item.date < top.date) ? item : top);
    const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date) || a.trainingId - b.trainingId);
    const last = sorted[sorted.length - 1]!;
    const byTraining = new Map<number, Measurement[]>();
    for (const item of sorted) byTraining.set(item.trainingId, [...(byTraining.get(item.trainingId) ?? []), item]);
    const series = [...byTraining.values()].map(group => {
      const times = group.map(item => item.timeMs);
      return { trainingId: group[0]!.trainingId, date: group[0]!.date, count: times.length, bestMs: Math.max(...times), worstMs: Math.min(...times), avgMs: average(times)! };
    });
    const recent = list.filter(item => item.date >= recentFrom).map(item => item.timeMs);
    const earlier = list.filter(item => item.date < recentFrom).map(item => item.timeMs);
    const recentAvg = average(recent), earlierAvg = average(earlier);
    return {
      key, kind: list[0]!.kind, label: list[0]!.label, elementId: list[0]!.elementId, name: last.name, apparatusId: list[0]!.apparatusId, apparatusName: sorted[sorted.length - 1]!.apparatusName, count: list.length,
      bestMs: best.timeMs, bestDate: best.date, bestTrainingId: best.trainingId,
      avgMs: average(list.map(item => item.timeMs))!, lastMs: last.timeMs, lastDate: last.date,
      recentAvgMs: recentAvg, earlierAvgMs: earlierAvg, trendMs: recentAvg !== null && earlierAvg !== null ? recentAvg - earlierAvg : null,
      series,
    };
  });
  items.sort((a, b) => b.lastDate.localeCompare(a.lastDate) || b.count - a.count || a.label.localeCompare(b.label, 'pl'));
  return { recentDays: RECENT_DAYS, items };
}

/** Times in this training that beat everything the athlete measured before in other trainings. */
export function newTimeRecords(db: Db, userId: number, trainingId: number) {
  const current = measurements(db, userId, undefined, undefined, trainingId);
  if (!current.length) return [];
  const date = current[0]!.date;
  const earlier = (item: Measurement) => item.date < date || (item.date === date && item.trainingId < trainingId);
  const previousBest = new Map<string, number>();
  for (const item of measurements(db, userId)) if (earlier(item)) previousBest.set(item.key, Math.max(previousBest.get(item.key) ?? 0, item.timeMs));
  const best = new Map<string, Measurement>();
  for (const item of current) if (!best.has(item.key) || item.timeMs > best.get(item.key)!.timeMs) best.set(item.key, item);
  return [...best.values()].filter(item => previousBest.has(item.key) && item.timeMs > previousBest.get(item.key)!)
    .map(item => ({ key: item.key, kind: item.kind, label: item.name ? `${item.label} ${item.name}` : item.label, apparatusName: item.apparatusName, timeMs: item.timeMs, previousMs: previousBest.get(item.key)! }));
}
