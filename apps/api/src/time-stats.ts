import type { Db } from './db.js';

// Time statistics read only saved training snapshots (code, routine name and range as they were then).
// A longer time is better (time in the air), so the record is the longest time.

type Measurement = { key: string; kind: 'element' | 'routine'; label: string; trainingId: number; date: string; timeMs: number };

const RECENT_DAYS = 30;

function measurements(db: Db, userId: number, from?: string, to?: string, trainingId?: number): Measurement[] {
  const conditions = ['t.user_id=?']; const values: unknown[] = [userId];
  if (from) { conditions.push('t.training_date>=?'); values.push(from); }
  if (to) { conditions.push('t.training_date<=?'); values.push(to); }
  if (trainingId !== undefined) { conditions.push('t.id=?'); values.push(trainingId); }
  const where = conditions.join(' AND ');
  const rows = db.prepare(`
    SELECT 'element' kind,a.code_snapshot code,NULL routine,NULL rangeStart,NULL rangeEnd,0 isFull,t.id trainingId,t.training_date date,a.time_ms timeMs
      FROM trainings t JOIN training_entries te ON te.training_id=t.id JOIN activities a ON a.entry_id=te.id
      WHERE ${where} AND a.kind='element' AND a.time_ms IS NOT NULL
    UNION ALL
    SELECT 'element',ae.code_snapshot,NULL,NULL,NULL,0,t.id,t.training_date,ae.time_ms
      FROM trainings t JOIN training_entries te ON te.training_id=t.id JOIN activities a ON a.entry_id=te.id JOIN activity_elements ae ON ae.activity_id=a.id
      WHERE ${where} AND ae.time_ms IS NOT NULL
    UNION ALL
    SELECT 'routine',NULL,a.source_routine_name,a.range_start,a.range_end,a.is_full_range,t.id,t.training_date,a.time_ms
      FROM trainings t JOIN training_entries te ON te.training_id=t.id JOIN activities a ON a.entry_id=te.id
      WHERE ${where} AND a.kind='routine' AND a.time_ms IS NOT NULL`).all(...values, ...values, ...values) as any[];
  return rows.map(row => row.kind === 'element'
    ? { key: `element:${row.code}`, kind: 'element' as const, label: String(row.code), trainingId: row.trainingId, date: row.date, timeMs: row.timeMs }
    : { key: `routine:${row.routine}|${row.isFull ? 'full' : `${row.rangeStart}-${row.rangeEnd}`}`, kind: 'routine' as const,
        label: row.isFull ? String(row.routine) : `${row.routine} (poz. ${row.rangeStart}–${row.rangeEnd})`, trainingId: row.trainingId, date: row.date, timeMs: row.timeMs });
}

const average = (values: number[]) => values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;

export function timeStats(db: Db, userId: number, from?: string, to?: string, today = new Date()) {
  const recentFrom = new Date(today.getTime() - RECENT_DAYS * 86_400_000).toISOString().slice(0, 10);
  const groups = new Map<string, Measurement[]>();
  for (const item of measurements(db, userId, from, to)) groups.set(item.key, [...(groups.get(item.key) ?? []), item]);
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
      key, kind: list[0]!.kind, label: list[0]!.label, count: list.length,
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
    .map(item => ({ key: item.key, kind: item.kind, label: item.label, timeMs: item.timeMs, previousMs: previousBest.get(item.key)! }));
}
