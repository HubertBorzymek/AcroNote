import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkElementCode, parseCatalogCode, parseTumblingCode } from '@acronote/shared';
import { buildApp } from '../src/app.js';
import { openDatabase, type Db } from '../src/db.js';
import { sessionCookie } from './helpers.js';

describe('zapis ścieżkowy (symbole FIG)', () => {
  it.each([
    ['0o', '0o', 1, 0, 'back', 'o'],
    ['.0<', '.0<', 1, 0, 'front', '<'],
    ['.1', '.1', 1, 0.5, 'front', null],
    ['1.', '1.', 1, 0.5, 'back', null],
    ['1. /', '1./', 1, 0.5, 'back', '/'],
    ['2.', '2.', 1, 1, 'back', null],
    ['3', '3', 1, 1.5, 'back', null],
    ['0 0 /', '00/', 2, 0, 'back', '/'],
    ['22o', '22o', 2, 2, 'back', 'o'],
    ['.00o', '.00o', 2, 0, 'front', 'o'],
    ['0ox', '0ox', 1, 0, 'side', 'o'],
    ['0 < x', '0<x', 1, 0, 'side', '<'],
    ['200O', '200o', 3, 1, 'back', 'o'],
    ['0000<', '0000<', 4, 0, 'back', '<'],
  ] as const)('czyta %s', (input, code, saltos, twists, direction, position) => {
    expect(parseTumblingCode(input)).toMatchObject({ code, special: null, saltoCount: saltos, totalTwists: twists, direction, positionSymbol: position });
  });

  it.each([['(', '('], ['F', 'F'], ['f', 'F'], ['h', 'H'], ['X', 'X'], ['x', 'X'], ['^', '^']] as const)('element specjalny %s', (input, code) => {
    expect(parseTumblingCode(input)).toMatchObject({ code, special: code, saltoCount: 0, direction: null, positionSymbol: null });
  });

  it.each(['0', '00', '0.o', '.1.', '.0ox', '0x', '1.x', '00000o', 'o', '<', 'abc', '4o2', ''])('odrzuca %s', (code) => {
    expect(parseTumblingCode(code)).toBeNull();
  });

  it('ten sam napis znaczy co innego w dwóch zapisach', () => {
    expect(parseCatalogCode('trampoline', '40o')).toMatchObject({ saltoCount: 1, totalTwists: 0 });
    expect(parseCatalogCode('tumbling', '40o')).toMatchObject({ saltoCount: 2, totalTwists: 2 });
    expect(parseCatalogCode('tumbling', 'o')).toBeNull();
    // 4o is a valid tumbling element (back double full, tuck); 00Y uses a position the app does not know.
    expect(parseCatalogCode('tumbling', '4o')).toMatchObject({ saltoCount: 1, totalTwists: 2 });
    expect(() => checkElementCode('00Y', false, 'tumbling')).toThrow(/ścieżkowym/);
    expect(checkElementCode('00Y', true, 'tumbling')).toEqual({ code: '00Y', parsed: null });
  });
});

type App = Awaited<ReturnType<typeof buildApp>>;

describe('katalog ścieżkowy w API', () => {
  let db: Db; let app: App; let athlete: string;
  beforeEach(async () => {
    db = openDatabase(':memory:');
    app = await buildApp({ db });
    athlete = sessionCookie(await app.inject({ method: 'POST', url: '/api/auth/register', payload: { username: 'zawodnik', password: 'bezpieczne-haslo' } }));
  });
  afterEach(async () => { await app.close(); db.close(); });
  const get = (url: string) => app.inject({ method: 'GET', url, headers: { cookie: athlete } });
  const send = (method: 'POST' | 'PUT', url: string, payload: object) => app.inject({ method, url, headers: { cookie: athlete }, payload });
  const apparatus = async () => (await get('/api/apparatus')).json() as any[];

  it('elementy żyją w swoim zapisie; ten sam kod może być w obu', async () => {
    const trampoline = await send('POST', '/api/elements', { code: '40o' });
    const tumbling = await send('POST', '/api/elements', { code: '40o', catalog: 'tumbling' });
    expect(trampoline.json()).toMatchObject({ catalog: 'trampoline', saltoCount: 1 });
    expect(tumbling.statusCode, tumbling.body).toBe(201);
    expect(tumbling.json()).toMatchObject({ catalog: 'tumbling', saltoCount: 2, totalTwists: 2 });
    expect((await send('POST', '/api/elements', { code: '40o', catalog: 'tumbling' })).statusCode).toBe(409);
    expect((await send('POST', '/api/elements', { code: '0 0 /', catalog: 'tumbling' })).json()).toMatchObject({ code: '00/', direction: 'back' });
    expect((await send('POST', '/api/elements', { code: 'f', catalog: 'tumbling' })).json()).toMatchObject({ code: 'F', saltoCount: 0 });
    expect((await send('POST', '/api/elements', { code: '0ox', catalog: 'tumbling' })).json()).toMatchObject({ direction: 'side' });
    expect((await send('POST', '/api/elements', { code: '00Y', catalog: 'tumbling' })).statusCode).toBe(400);
    expect((await send('POST', '/api/elements', { code: '00Y', catalog: 'tumbling', allowNonStandardCode: true })).json()).toMatchObject({ code: '00Y', saltoCount: null, catalog: 'tumbling' });
    expect((await send('POST', '/api/elements', { code: '0o', catalog: 'ścieżka' })).statusCode).toBe(400);

    expect((await get('/api/elements?catalog=tumbling')).json().map((item: any) => item.code).sort()).toEqual(['00/', '00Y', '0ox', '40o', 'F']);
    expect((await get('/api/elements?catalog=trampoline')).json().map((item: any) => item.code)).toEqual(['40o']);
    expect((await get('/api/elements?catalog=tumbling&direction=side')).json().map((item: any) => item.code)).toEqual(['0ox']);
    expect((await get('/api/elements?catalog=tumbling&saltoCount=0')).json().map((item: any) => item.code)).toEqual(['F']);

    const id = tumbling.json().id;
    expect((await send('PUT', `/api/elements/${id}`, { code: '40o', catalog: 'trampoline' })).statusCode).toBe(400);
    expect((await send('PUT', `/api/elements/${id}`, { code: '22o', favorite: true })).statusCode).toBe(200);
    expect(db.prepare('SELECT code,catalog,salto_count s,total_twist_halves h FROM elements WHERE id=?').get(id)).toEqual({ code: '22o', catalog: 'tumbling', s: 2, h: 4 });
  });

  it('układ i wejście na Ścieżce przyjmują tylko elementy ścieżkowe', async () => {
    const [trampoline, , tumblingApparatus] = await apparatus();
    expect(tumblingApparatus).toMatchObject({ name: 'Ścieżka', catalog: 'tumbling' });
    const back = (await send('POST', '/api/elements', { code: '40o' })).json();
    const salto = (await send('POST', '/api/elements', { code: '0o', catalog: 'tumbling' })).json();
    const roundoff = (await send('POST', '/api/elements', { code: '(', catalog: 'tumbling' })).json();

    expect((await send('POST', '/api/routines', { name: 'Zły', apparatusId: tumblingApparatus.id, items: [{ elementId: back.id }] })).json().message).toMatch(/ścieżkowym/);
    const pass = await send('POST', '/api/routines', { name: 'Przebieg', apparatusId: tumblingApparatus.id, items: [{ elementId: roundoff.id }, { elementId: salto.id }] });
    expect(pass.statusCode, pass.body).toBe(201);
    // Moving the pass to the trampoline would mix notations.
    expect((await send('PUT', `/api/routines/${pass.json().id}`, { name: 'Przebieg', apparatusId: trampoline.id, items: [{ elementId: roundoff.id }, { elementId: salto.id }] })).json().message).toMatch(/trampolinowym/);

    const element = (item: any) => ({ kind: 'element', sourceElementId: item.id, code: item.code, repetitions: 2, executionTypeName: 'Materac' });
    const wrong = await send('POST', '/api/trainings', { date: '2026-11-20', entries: [{ apparatusId: tumblingApparatus.id, activities: [element(back)] }] });
    expect(wrong.json().message).toMatch(/tylko elementy ścieżkowe/);
    const ok = await send('POST', '/api/trainings', { date: '2026-11-20', entries: [
      { apparatusId: trampoline.id, activities: [element(back)] },
      { apparatusId: tumblingApparatus.id, activities: [element(roundoff), { kind: 'routine', sourceRoutineId: pass.json().id, sourceRoutineName: 'Przebieg', rangeStart: 1, rangeEnd: 2, isFullRange: true, repetitions: 1, executionTypeName: 'Materac',
        elements: [{ sourceElementId: roundoff.id, code: '(', position: 1 }, { sourceElementId: salto.id, code: '0o', position: 2 }] }] },
    ] });
    expect(ok.statusCode, ok.body).toBe(201);
    const onTumbling = (await get(`/api/stats/summary?apparatusId=${tumblingApparatus.id}`)).json();
    expect(onTumbling).toMatchObject({ entries: 1, totalElements: 4, byCode: { '(': 3, '0o': 1 } });
    expect((await get(`/api/stats/summary?apparatusId=${trampoline.id}`)).json().byCode).toEqual({ '40o': 2 });
  });
});

describe('migracja v8: katalogi elementów', () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'acronote-v8-')); });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('przebudowuje tabelę elementów: wszystko na trampolinie, te same id, kod w obrębie zapisu', () => {
    const path = join(dir, 'v7.db');
    let db = openDatabase(path);
    const userId = Number(db.prepare("INSERT INTO users(username,password_hash) VALUES('stary','h')").run().lastInsertRowid);
    db.prepare("INSERT INTO apparatus(user_id,name,sort_order,catalog,tracks_time) VALUES(?,'Trampolina',0,'trampoline',1),(?,'DMT',1,'trampoline',0)").run(userId, userId);
    // The elements table as it was before v8 (code unique per user, no catalog).
    db.exec(`DROP TABLE elements; DELETE FROM migrations WHERE version=8;
      CREATE TABLE elements (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        code TEXT NOT NULL, name TEXT, favorite INTEGER NOT NULL DEFAULT 0, hidden INTEGER NOT NULL DEFAULT 0, deleted_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, quarter_count INTEGER, salto_count INTEGER, total_twist_halves INTEGER,
        direction TEXT, position_symbol TEXT, UNIQUE(user_id, code));`);
    db.prepare("INSERT INTO elements(id,user_id,code,name,favorite,deleted_at) VALUES(7,?,'40o','Salto',1,NULL),(9,?,'4o',NULL,0,NULL),(12,?,'831<',NULL,0,'2026-11-01')").run(userId, userId, userId);
    const routineId = Number(db.prepare("INSERT INTO routines(user_id,name,apparatus_id) VALUES(?,'U',(SELECT id FROM apparatus WHERE name='Trampolina'))").run(userId).lastInsertRowid);
    db.prepare("INSERT INTO routine_items(routine_id,position,element_id,code_snapshot) VALUES(?,1,7,'40o')").run(routineId);
    db.close();

    db = openDatabase(path);
    try {
      expect((db.prepare('SELECT MAX(version) v FROM migrations').get() as any).v).toBe(10);
      expect(db.prepare('SELECT id,code,name,favorite,deleted_at deletedAt,catalog,salto_count s FROM elements ORDER BY id').all()).toEqual([
        { id: 7, code: '40o', name: 'Salto', favorite: 1, deletedAt: null, catalog: 'trampoline', s: 1 },
        { id: 9, code: '4o', name: null, favorite: 0, deletedAt: null, catalog: 'trampoline', s: null },
        { id: 12, code: '831<', name: null, favorite: 0, deletedAt: '2026-11-01', catalog: 'trampoline', s: 2 },
      ]);
      expect((db.prepare('SELECT e.code FROM routine_items ri JOIN elements e ON e.id=ri.element_id').get() as any).code).toBe('40o');
      expect(db.prepare('SELECT name,catalog,tracks_time t FROM apparatus WHERE user_id=? ORDER BY sort_order').all(userId)).toEqual([
        { name: 'Trampolina', catalog: 'trampoline', t: 1 }, { name: 'DMT', catalog: 'trampoline', t: 0 }, { name: 'Ścieżka', catalog: 'tumbling', t: 0 }]);
      db.prepare("INSERT INTO elements(user_id,code,catalog,salto_count,direction) VALUES(?,'40o','tumbling',2,'back')").run(userId);
      // Since v9 the API (code + description) guards duplicates; the table keeps only an index.
      expect((db.prepare('PRAGMA index_list(elements)').all() as any[]).map(index => [index.name, index.unique])).toEqual([['idx_elements_user_code', 0]]);
      expect((db.prepare('PRAGMA integrity_check').get() as any).integrity_check).toBe('ok');
      expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    } finally { db.close(); }

    // A restart recomputes derived fields with each element's own notation.
    db = openDatabase(path);
    try {
      expect(db.prepare("SELECT salto_count s,total_twist_halves h,direction d FROM elements WHERE catalog='tumbling'").get()).toEqual({ s: 2, h: 4, d: 'back' });
      expect((db.prepare('SELECT COUNT(*) n FROM apparatus').get() as any).n).toBe(3);
    } finally { db.close(); }
  });
});
