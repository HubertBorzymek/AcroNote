import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../src/app.js';
import { openDatabase, type Db } from '../src/db.js';
import { trainingSummary } from '../src/training-service.js';
import { sessionCookie } from './helpers.js';

type App = Awaited<ReturnType<typeof buildApp>>;

describe('połączenia (combo) i nieukończone elementy', () => {
  let db: Db; let app: App; let athlete: string;
  beforeEach(async () => {
    db = openDatabase(':memory:');
    app = await buildApp({ db });
    athlete = sessionCookie(await app.inject({ method: 'POST', url: '/api/auth/register', payload: { username: 'ola', password: 'bezpieczne-haslo' } }));
  });
  afterEach(async () => { await app.close(); db.close(); });
  const get = (url: string) => app.inject({ method: 'GET', url, headers: { cookie: athlete } });
  const send = (method: 'POST' | 'PUT' | 'DELETE', url: string, payload?: object) => app.inject({ method, url, headers: { cookie: athlete }, ...(payload && { payload }) });

  it('połączenie to osobny rodzaj czynności: elementy liczą się normalnie, ale nie jako układ ani fragment', async () => {
    const tumbling = (await get('/api/apparatus')).json().find((item: any) => item.catalog === 'tumbling');
    const rundak = (await send('POST', '/api/elements', { code: '(', catalog: 'tumbling' })).json();
    const flik = (await send('POST', '/api/elements', { code: 'F', catalog: 'tumbling' })).json();
    const salto = (await send('POST', '/api/elements', { code: '00/', catalog: 'tumbling' })).json();
    const combo = { kind: 'combo', repetitions: 3, executionTypeName: 'Zeskok', elements: [
      { sourceElementId: rundak.id, code: '(', executionTypeName: 'Ścieżka' },
      { sourceElementId: flik.id, code: 'F', executionTypeName: 'Ścieżka' },
      { sourceElementId: salto.id, code: '00/', executionTypeName: 'Zeskok' },
    ] };
    const saved = await send('POST', '/api/trainings', { date: '2026-11-26', entries: [{ apparatusId: tumbling.id, activities: [
      combo, { kind: 'element', sourceElementId: flik.id, code: 'F', repetitions: 2, executionTypeName: 'Ścieżka' },
    ] }] });
    expect(saved.statusCode, saved.body).toBe(201);
    const stored = saved.json().entries[0].activities[0];
    expect(stored).toMatchObject({ kind: 'combo', repetitions: 3, sourceRoutineId: null, sourceRoutineName: null, rangeStart: null, isFullRange: 0, executionTypeName: 'Zeskok' });
    expect(stored.elements.map((item: any) => [item.position, item.code, item.executionTypeName, item.unfinished])).toEqual([[1, '(', 'Ścieżka', false], [2, 'F', 'Ścieżka', false], [3, '00/', 'Zeskok', false]]);
    const summary = (await get('/api/stats/summary')).json();
    expect(summary).toMatchObject({ totalElements: 11, combos: 3, fullRoutines: 0, fragments: 0, byCode: { '(': 3, F: 5, '00/': 3 } });
    expect(summary.byLanding).toEqual([{ name: 'Ścieżka', count: 8 }, { name: 'Zeskok', count: 3 }]);
    expect((await get('/api/trainings')).json()[0]).toMatchObject({ totalElements: 11 });
    // Elements of a combo must be in the notation of the entry's apparatus.
    const trampoline = (await get('/api/apparatus')).json().find((item: any) => item.name === 'Trampolina');
    const wrong = await send('POST', '/api/trainings', { date: '2026-11-26', entries: [{ apparatusId: trampoline.id, activities: [combo] }] });
    expect(wrong.statusCode).toBe(400);
    expect((await send('POST', '/api/trainings', { date: '2026-11-26', entries: [{ activities: [{ ...combo, elements: [] }] }] })).json().message).toMatch(/Połączenie musi zawierać elementy/);
    expect((await send('POST', '/api/trainings', { date: '2026-11-26', entries: [{ activities: [{ ...combo, kind: 'cokolwiek' }] }] })).statusCode).toBe(400);
  });

  it('czas połączenia ma własny rekord, rozpoznawany po kodach w kolejności', async () => {
    const trampoline = (await get('/api/apparatus')).json()[0];
    const combo = (timeMs: number, codes = ['41o', '800o']) => ({ kind: 'combo', repetitions: 1, timeMs, executionTypeName: 'Siatka', elements: codes.map((code) => ({ code, executionTypeName: 'Siatka' })) });
    await send('POST', '/api/trainings', { date: '2026-11-20', entries: [{ apparatusId: trampoline.id, activities: [combo(3000), combo(3100, ['800o', '41o'])] }] });
    const next = await send('POST', '/api/trainings', { date: '2026-11-21', entries: [{ apparatusId: trampoline.id, activities: [combo(3200)] }] });
    expect(next.json().newRecords).toMatchObject([{ kind: 'combo', label: '41o 800o', timeMs: 3200, previousMs: 3000 }]);
    const items = (await get('/api/stats/times')).json().items.filter((item: any) => item.kind === 'combo');
    expect(items.map((item: any) => [item.label, item.count, item.bestMs]).sort()).toEqual([['41o 800o', 2, 3200], ['800o 41o', 1, 3100]]);
    expect((await send('POST', '/api/trainings', { date: '2026-11-21', entries: [{ activities: [{ ...combo(3000), repetitions: 2 }] }] })).statusCode).toBe(400);
  });

  it('nieukończony element w środku połączenia: jedna nieudana próba tego elementu, reszta się liczy', async () => {
    const a = (await send('POST', '/api/elements', { code: '40o' })).json();
    const b = (await send('POST', '/api/elements', { code: '41o' })).json();
    const combo = (unfinishedIndex: number | null, repetitions = 1) => ({ kind: 'combo', repetitions, executionTypeName: 'Materac', elements: [a, b, a].map((item, index) => ({ sourceElementId: item.id, code: item.code, executionTypeName: index === 2 ? 'Materac' : 'Siatka', unfinished: index === unfinishedIndex })) });
    const saved = await send('POST', '/api/trainings', { date: '2026-11-26', entries: [{ activities: [combo(1)] }, { activities: [combo(null, 2)] }] });
    expect(saved.statusCode, saved.body).toBe(201);
    expect(saved.json().entries.map((entry: any) => entry.unfinished)).toEqual([true, false]);
    expect(saved.json().entries[0].activities[0].unfinished).toBe(false);
    expect(saved.json().entries[0].activities[0].elements.map((item: any) => item.unfinished)).toEqual([false, true, false]);
    const summary = (await get('/api/stats/summary')).json();
    expect(summary).toMatchObject({ unfinishedEntries: 1, totalElements: 9 });
    expect(summary.byElement.map((item: any) => [item.code, item.count, item.failed])).toEqual([['40o', 6, 0], ['41o', 3, 1]]);
    // A combo with an unfinished element is one execution.
    expect((await send('POST', '/api/trainings', { date: '2026-11-26', entries: [{ activities: [combo(0, 2)] }] })).statusCode).toBe(400);
  });

  it('nowe konto ma Siatkę i Ścieżkę; tych miejsc nie da się przemianować ani usunąć, można je ukryć', async () => {
    const types = (await get('/api/execution-types')).json();
    expect(types.map((item: any) => [item.name, item.fixed])).toEqual([['Siatka', true], ['Materac', false], ['Gąbki', false], ['Ścieżka', true]]);
    const siatka = types[0]; const path = types[3]; const mat = types[1];
    const rename = await send('PUT', `/api/execution-types/${siatka.id}`, { name: 'Trampolina', sortOrder: 0, hidden: false });
    expect(rename.statusCode).toBe(400); expect(rename.json().message).toMatch(/nie można zmienić/);
    expect((await send('DELETE', `/api/execution-types/${path.id}`)).statusCode).toBe(400);
    expect((await send('PUT', `/api/execution-types/${path.id}`, { name: 'Ścieżka', sortOrder: 5, hidden: true })).statusCode).toBe(200);
    expect((await send('PUT', `/api/execution-types/${mat.id}`, { name: 'Materac gruby', sortOrder: 1, hidden: false })).statusCode).toBe(200);
    expect((await send('DELETE', `/api/execution-types/${mat.id}`)).statusCode).toBe(200);
    expect((await get('/api/execution-types')).json().map((item: any) => [item.name, Boolean(item.hidden)])).toEqual([['Siatka', false], ['Gąbki', false], ['Ścieżka', true]]);
  });
});

describe('migracja v10: połączenia i nieukończone elementy', () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'acronote-v10-')); });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('przebudowuje czynności z tymi samymi id, przenosi „nieukończone” z wejścia na ostatni element i nie zmienia liczb', () => {
    const path = join(dir, 'v9.db');
    let db = openDatabase(path);
    // Back to the v9 shape: activities without 'combo' and `unfinished`, elements without `unfinished`.
    db.pragma('foreign_keys = OFF');
    db.exec(`DROP TABLE activity_elements; DROP TABLE activities; DELETE FROM migrations WHERE version=10;
      CREATE TABLE activities (id INTEGER PRIMARY KEY, entry_id INTEGER NOT NULL REFERENCES training_entries(id) ON DELETE CASCADE,
        position INTEGER NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('element','routine')), repetitions INTEGER NOT NULL CHECK(repetitions > 0),
        execution_type_id INTEGER, execution_type_name TEXT NOT NULL, source_element_id INTEGER, code_snapshot TEXT, name_snapshot TEXT,
        source_routine_id INTEGER, source_routine_name TEXT, source_template_version INTEGER, range_start INTEGER, range_end INTEGER,
        is_full_range INTEGER NOT NULL DEFAULT 0, matched_original_template INTEGER NOT NULL DEFAULT 0, time_ms INTEGER);
      CREATE TABLE activity_elements (id INTEGER PRIMARY KEY, activity_id INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
        position INTEGER NOT NULL, source_element_id INTEGER, code_snapshot TEXT NOT NULL, name_snapshot TEXT,
        execution_type_id INTEGER, execution_type_name TEXT NOT NULL, time_ms INTEGER);`);
    db.pragma('foreign_keys = ON');
    const userId = Number(db.prepare("INSERT INTO users(username,password_hash) VALUES('stary','h')").run().lastInsertRowid);
    // An older account: "Siatka" deleted, no "Ścieżka".
    db.prepare("INSERT INTO execution_types(user_id,name,sort_order,deleted_at) VALUES(?,'Siatka',0,'2026-01-01')").run(userId);
    db.prepare("INSERT INTO execution_types(user_id,name,sort_order) VALUES(?,'Materac',1)").run(userId);
    db.prepare("INSERT INTO elements(id,user_id,code) VALUES(1,?,'40o'),(2,?,'41o')").run(userId, userId);
    const trainingId = Number(db.prepare("INSERT INTO trainings(user_id,training_date) VALUES(?,'2026-11-01')").run(userId).lastInsertRowid);
    const entry = (position: number, unfinished: number) => Number(db.prepare("INSERT INTO training_entries(training_id,position,default_execution_type_name,unfinished) VALUES(?,?,'Materac',?)").run(trainingId, position, unfinished).lastInsertRowid);
    const element = (id: number, entryId: number, position: number, elementId: number, code: string, repetitions: number, timeMs: number | null = null) =>
      db.prepare("INSERT INTO activities(id,entry_id,position,kind,repetitions,execution_type_name,source_element_id,code_snapshot,time_ms) VALUES(?,?,?,'element',?,'Materac',?,?,?)").run(id, entryId, position, repetitions, elementId, code, timeMs);
    const routine = (id: number, entryId: number, position: number, repetitions: number) => {
      db.prepare("INSERT INTO activities(id,entry_id,position,kind,repetitions,execution_type_name,source_routine_name,range_start,range_end,is_full_range) VALUES(?,?,?,'routine',?,'Materac','U',1,2,1)").run(id, entryId, position, repetitions);
      db.prepare("INSERT INTO activity_elements(activity_id,position,source_element_id,code_snapshot,execution_type_name) VALUES(?,1,1,'40o','Materac'),(?,2,2,'41o','Materac')").run(id, id);
    };
    const e1 = entry(0, 1); element(10, e1, 0, 2, '41o', 1); element(11, e1, 1, 1, '40o', 3);   // last ×3 → ×2 + ×1 unfinished
    const e2 = entry(1, 1); element(20, e2, 0, 1, '40o', 1, 1500);                             // last ×1 → marked
    const e3 = entry(2, 1); routine(30, e3, 0, 1);                                              // routine ×1 → its last element
    const e4 = entry(3, 1); routine(40, e4, 0, 2);                                              // routine ×2 → ×1 + ×1 with last element unfinished
    const e5 = entry(4, 0); element(50, e5, 0, 1, '40o', 2);
    const e6 = entry(5, 1);                                                                     // no activities: nothing to mark
    // Before v10: 40o 9× / 41o 4×, 13 elements, 3 full routines; failed attempts (last element of an
    // unfinished entry): 40o in e1 and e2, 41o in e3 and e4 — two each.
    db.close();

    db = openDatabase(path);
    try {
      expect((db.prepare('SELECT MAX(version) v FROM migrations').get() as any).v).toBe(10);
      expect((db.prepare("SELECT sql FROM sqlite_master WHERE name='activities'").get() as any).sql).toContain("'combo'");
      const rows = (entryId: number) => db.prepare('SELECT id,kind,repetitions,unfinished,time_ms timeMs,code_snapshot code FROM activities WHERE entry_id=? ORDER BY position').all(entryId) as any[];
      expect(rows(e1).map((row) => [row.code, row.repetitions, row.unfinished])).toEqual([['41o', 1, 0], ['40o', 2, 0], ['40o', 1, 1]]);
      expect(rows(e1).slice(0, 2).map((row) => row.id)).toEqual([10, 11]);
      expect(rows(e2)).toMatchObject([{ id: 20, repetitions: 1, unfinished: 1, timeMs: 1500 }]);
      const elements = (activityId: number) => db.prepare('SELECT code_snapshot code,unfinished FROM activity_elements WHERE activity_id=? ORDER BY position').all(activityId);
      expect(rows(e3)).toMatchObject([{ id: 30, repetitions: 1, unfinished: 0 }]);
      expect(elements(30)).toEqual([{ code: '40o', unfinished: 0 }, { code: '41o', unfinished: 1 }]);
      const split = rows(e4);
      expect(split.map((row) => [row.id === 40, row.kind, row.repetitions])).toEqual([[true, 'routine', 1], [false, 'routine', 1]]);
      expect(elements(40)).toEqual([{ code: '40o', unfinished: 0 }, { code: '41o', unfinished: 0 }]);
      expect(elements(split[1].id)).toEqual([{ code: '40o', unfinished: 0 }, { code: '41o', unfinished: 1 }]);
      expect(rows(e5)).toMatchObject([{ id: 50, repetitions: 2, unfinished: 0 }]);
      expect(db.prepare('SELECT id,unfinished FROM training_entries ORDER BY position').all()).toEqual([[e1, 1], [e2, 1], [e3, 1], [e4, 1], [e5, 0], [e6, 0]].map(([id, unfinished]) => ({ id, unfinished })));
      // Statistics are the same as before the migration (counts and failed attempts).
      const after = trainingSummary(db, userId);
      expect(after).toMatchObject({ entries: 6, unfinishedEntries: 4, totalElements: 13, byCode: { '40o': 9, '41o': 4 }, fullRoutines: 3, fragments: 0, combos: 0 });
      expect(after.byElement.map((item) => [item.code, item.count, item.failed])).toEqual([['40o', 9, 2], ['41o', 4, 2]]);
      expect(db.prepare('SELECT name,hidden FROM execution_types WHERE user_id=? AND deleted_at IS NULL ORDER BY sort_order').all(userId)).toEqual([{ name: 'Siatka', hidden: 1 }, { name: 'Materac', hidden: 0 }, { name: 'Ścieżka', hidden: 0 }]);
      expect((db.prepare('PRAGMA integrity_check').get() as any).integrity_check).toBe('ok');
      expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
      expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
    } finally { db.close(); }

    // Opening again changes nothing.
    db = openDatabase(path);
    try {
      expect((db.prepare('SELECT COUNT(*) n FROM activities').get() as any).n).toBe(8);
      expect((db.prepare('SELECT COUNT(*) n FROM activity_elements').get() as any).n).toBe(6);
      expect((db.prepare('SELECT COUNT(*) n FROM execution_types').get() as any).n).toBe(3);
    } finally { db.close(); }
  });
});
