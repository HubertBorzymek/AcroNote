import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../src/app.js';
import { openDatabase, type Db } from '../src/db.js';
import { buildUserSnapshot } from '../src/bug-reports.js';
import { sessionCookie } from './helpers.js';

type App = Awaited<ReturnType<typeof buildApp>>;

const element = (code: string, timeMs?: number) => ({ kind: 'element', code, repetitions: 1, executionTypeName: 'Siatka', ...(timeMs !== undefined && { timeMs }) });

describe('sprzęty (trampolina, DMT…)', () => {
  let db: Db; let app: App; let athlete: string; let athleteId: number; let coach: string; let stranger: string;
  beforeEach(async () => {
    db = openDatabase(':memory:');
    app = await buildApp({ db });
    const registered = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { username: 'zawodniczka', password: 'bezpieczne-haslo' } });
    athlete = sessionCookie(registered); athleteId = registered.json().id;
    coach = sessionCookie(await app.inject({ method: 'POST', url: '/api/auth/register', payload: { username: 'trener', password: 'bezpieczne-haslo' } }));
    stranger = sessionCookie(await app.inject({ method: 'POST', url: '/api/auth/register', payload: { username: 'obcy', password: 'bezpieczne-haslo' } }));
    await app.inject({ method: 'PUT', url: '/api/profile', headers: { cookie: coach }, payload: { athleteEnabled: false, coachEnabled: true } });
    await app.inject({ method: 'PUT', url: '/api/profile', headers: { cookie: stranger }, payload: { athleteEnabled: true, coachEnabled: true } });
    const invitation = (await app.inject({ method: 'POST', url: '/api/coach/invitations', headers: { cookie: athlete }, payload: { role: 'athlete' } })).json();
    await app.inject({ method: 'POST', url: '/api/coach/invitations/accept', headers: { cookie: coach }, payload: { token: invitation.token } });
  });
  afterEach(async () => { await app.close(); db.close(); });
  const get = (url: string, cookie = athlete) => app.inject({ method: 'GET', url, headers: { cookie } });
  const send = (method: 'POST' | 'PUT', url: string, payload: object, cookie = athlete) => app.inject({ method, url, headers: { cookie }, payload });
  const list = async (cookie = athlete) => (await get('/api/apparatus', cookie)).json() as any[];

  it('nowe konto ma domyślnie Trampolinę (z czasem), a DMT bez czasu na drugiej pozycji', async () => {
    expect(await list()).toMatchObject([{ name: 'Trampolina', catalog: 'trampoline', tracksTime: true, hidden: false }, { name: 'DMT', catalog: 'trampoline', tracksTime: false }]);
  });

  it('lista jest edytowalna, a zapisu elementów nie da się zmienić po dodaniu', async () => {
    const added = await send('POST', '/api/apparatus', { name: 'Airtrack', catalog: 'trampoline', tracksTime: false });
    expect(added.statusCode, added.body).toBe(201); expect(added.json()).toMatchObject({ name: 'Airtrack', catalog: 'trampoline', tracksTime: false, sortOrder: 2 });
    expect((await send('POST', '/api/apparatus', { name: 'Airtrack' })).statusCode).toBe(409);
    expect((await send('POST', '/api/apparatus', { name: 'Ścieżka', catalog: 'tumbling' })).json().message).toMatch(/wkrótce/);
    const id = added.json().id;
    expect((await send('PUT', `/api/apparatus/${id}`, { name: 'Air', catalog: 'tumbling', tracksTime: true })).statusCode).toBe(400);
    expect((await send('PUT', `/api/apparatus/${id}`, { name: 'Air', sortOrder: 0, tracksTime: true })).statusCode).toBe(200);
    expect((await list()).find((item) => item.id === id)).toMatchObject({ name: 'Air', tracksTime: true, catalog: 'trampoline' });
    expect((await send('PUT', `/api/apparatus/${id}`, { name: 'DMT' })).statusCode).toBe(409);
  });

  it('nie pozwala ukryć ostatniego widocznego sprzętu', async () => {
    const [trampoline, dmt] = await list();
    expect((await send('PUT', `/api/apparatus/${dmt.id}`, { ...dmt, hidden: true })).statusCode).toBe(200);
    expect((await send('PUT', `/api/apparatus/${trampoline.id}`, { ...trampoline, hidden: true })).json().message).toMatch(/co najmniej jeden/);
  });

  it('cudzego sprzętu nie da się zmienić ani użyć w treningu, układzie i statystykach', async () => {
    const [foreign] = await list(stranger);
    expect((await send('PUT', `/api/apparatus/${foreign.id}`, { name: 'Przejęte' })).statusCode).toBe(404);
    expect((await list(stranger))[0].name).toBe('Trampolina');
    const training = await send('POST', '/api/trainings', { date: '2026-11-10', entries: [{ apparatusId: foreign.id, activities: [element('40o')] }] });
    expect(training.json().message).toMatch(/sprzęt nie istnieje/);
    expect((await send('POST', '/api/routines', { name: 'U', apparatusId: foreign.id, items: [{ code: '40o' }] })).json().message).toMatch(/sprzęt nie istnieje/);
    expect((await get(`/api/stats/summary?apparatusId=${foreign.id}`)).statusCode).toBe(404);
    expect((await get(`/api/stats/times?apparatusId=${foreign.id}`)).statusCode).toBe(404);
  });

  it('wejście zapisuje sprzęt w migawce; bez sprzętu dostaje domyślny', async () => {
    const [trampoline, dmt] = await list();
    const saved = await send('POST', '/api/trainings', { date: '2026-11-10', entries: [{ activities: [element('40o')] }, { apparatusId: dmt.id, activities: [element('41o')] }] });
    expect(saved.statusCode, saved.body).toBe(201);
    expect(saved.json().entries.map((entry: any) => [entry.apparatusId, entry.apparatusName])).toEqual([[trampoline.id, 'Trampolina'], [dmt.id, 'DMT']]);
    // Renaming the apparatus does not rewrite history.
    await send('PUT', `/api/apparatus/${dmt.id}`, { ...dmt, name: 'Mini' });
    expect((await get(`/api/trainings/${saved.json().id}`)).json().entries[1].apparatusName).toBe('DMT');
    expect((await get('/api/trainings')).json()[0].apparatusNames).toEqual(['Trampolina', 'DMT']);
    // The coach sees the apparatus too (read-only), a stranger does not.
    expect((await get(`/api/coach/athletes/${athleteId}/trainings`, coach)).json()[0].apparatusNames).toEqual(['Trampolina', 'DMT']);
    expect((await get(`/api/coach/athletes/${athleteId}/apparatus`, coach)).json().map((item: any) => item.name)).toEqual(['Trampolina', 'Mini']);
    expect((await get(`/api/coach/athletes/${athleteId}/apparatus`, stranger)).statusCode).toBe(403);
  });

  it('statystyki, czasy i rekordy liczą się osobno dla każdego sprzętu', async () => {
    const [trampoline, dmt] = await list();
    await send('POST', '/api/trainings', { date: '2026-11-01', entries: [{ apparatusId: trampoline.id, activities: [element('40o', 1500), element('40o', 1400)] }, { apparatusId: dmt.id, activities: [element('40o', 900), element('41o')] }] });
    const all = (await get('/api/stats/summary')).json();
    expect(all).toMatchObject({ trainings: 1, entries: 2, totalElements: 4 });
    const onTrampoline = (await get(`/api/stats/summary?apparatusId=${trampoline.id}`)).json();
    expect(onTrampoline).toMatchObject({ trainings: 1, entries: 1, totalElements: 2, byCode: { '40o': 2 } });
    const onDmt = (await get(`/api/stats/summary?apparatusId=${dmt.id}`)).json();
    expect(onDmt).toMatchObject({ entries: 1, totalElements: 2, byCode: { '40o': 1, '41o': 1 } });
    const coachView = (await get(`/api/coach/athletes/${athleteId}/stats?apparatusId=${dmt.id}`, coach)).json();
    expect(coachView.totalElements).toBe(2);

    const times = (await get('/api/stats/times')).json().items.filter((item: any) => item.label === '40o');
    expect(times.map((item: any) => [item.apparatusName, item.bestMs]).sort()).toEqual([['DMT', 900], ['Trampolina', 1500]]);
    expect((await get(`/api/stats/times?apparatusId=${dmt.id}`)).json().items).toMatchObject([{ label: '40o', bestMs: 900, apparatusName: 'DMT' }]);

    // 1000 ms on the DMT beats the DMT record (900), not the trampoline record (1500).
    const next = await send('POST', '/api/trainings', { date: '2026-11-02', entries: [{ apparatusId: dmt.id, activities: [element('40o', 1000)] }] });
    expect(next.json().newRecords).toMatchObject([{ label: '40o', apparatusName: 'DMT', timeMs: 1000, previousMs: 900 }]);
  });

  it('układ ma sprzęt: domyślny przy tworzeniu, zachowany przy edycji bez sprzętu', async () => {
    const [trampoline, dmt] = await list();
    const created = (await send('POST', '/api/routines', { name: 'Podejście', items: [{ code: '40o' }, { code: '41o' }] })).json();
    expect(created).toMatchObject({ apparatusId: trampoline.id, apparatusName: 'Trampolina' });
    const moved = (await send('PUT', `/api/routines/${created.id}`, { name: 'Podejście', apparatusId: dmt.id, items: [{ code: '40o' }, { code: '41o' }] })).json();
    expect(moved).toMatchObject({ apparatusId: dmt.id, apparatusName: 'DMT' });
    const kept = (await send('PUT', `/api/routines/${created.id}`, { name: 'Podejście 2', items: [{ code: '40o' }] })).json();
    expect(kept).toMatchObject({ apparatusId: dmt.id, name: 'Podejście 2' });
  });

  it('migawka zgłoszenia zawiera sprzęty, ale nadal bez oceny i komentarza', async () => {
    await send('POST', '/api/trainings', { date: '2026-11-10', rating: 9, comment: 'prywatne', entries: [{ activities: [element('40o')] }] });
    const snapshot = buildUserSnapshot(db, athleteId);
    expect(snapshot.apparatus.map((item: any) => item.name)).toEqual(['Trampolina', 'DMT']);
    expect(snapshot.trainings[0].entries[0].apparatusName).toBe('Trampolina');
    expect(JSON.stringify(snapshot)).not.toContain('prywatne');
  });
});

describe('migracja v7: historia na trampolinie', () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'acronote-v7-')); });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('bazie sprzed v7 dodaje sprzęty i przypisuje Trampolinę wszystkim wejściom i układom', () => {
    const path = join(dir, 'stara.db');
    let db = openDatabase(path);
    const userId = Number(db.prepare("INSERT INTO users(username,password_hash) VALUES('stary','h')").run().lastInsertRowid);
    const trainingId = Number(db.prepare("INSERT INTO trainings(user_id,training_date) VALUES(?,'2026-10-01')").run(userId).lastInsertRowid);
    const entryId = Number(db.prepare("INSERT INTO training_entries(training_id,position,default_execution_type_name) VALUES(?,0,'Siatka')").run(trainingId).lastInsertRowid);
    db.prepare("INSERT INTO activities(entry_id,position,kind,repetitions,execution_type_name,code_snapshot) VALUES(?,0,'element',3,'Siatka','40o')").run(entryId);
    db.prepare("INSERT INTO routines(user_id,name) VALUES(?,'Układ 1')").run(userId);
    // Back to the shape of a v6 database: no apparatus table rows, columns or migration mark.
    db.exec(`DELETE FROM apparatus; DELETE FROM migrations WHERE version=7;
      ALTER TABLE training_entries DROP COLUMN apparatus_id; ALTER TABLE training_entries DROP COLUMN apparatus_name; ALTER TABLE routines DROP COLUMN apparatus_id; DROP TABLE apparatus;`);
    db.close();

    db = openDatabase(path);
    try {
      expect((db.prepare('SELECT MAX(version) v FROM migrations').get() as any).v).toBe(7);
      const apparatus = db.prepare('SELECT id,name,tracks_time tracksTime FROM apparatus WHERE user_id=? ORDER BY sort_order').all(userId) as any[];
      expect(apparatus.map((item) => [item.name, item.tracksTime])).toEqual([['Trampolina', 1], ['DMT', 0]]);
      expect(db.prepare('SELECT apparatus_id id,apparatus_name name FROM training_entries WHERE id=?').get(entryId)).toEqual({ id: apparatus[0].id, name: 'Trampolina' });
      expect((db.prepare('SELECT apparatus_id id FROM routines WHERE user_id=?').get(userId) as any).id).toBe(apparatus[0].id);
      expect((db.prepare("SELECT code_snapshot code,repetitions FROM activities").get() as any)).toEqual({ code: '40o', repetitions: 3 });
      expect((db.prepare('PRAGMA integrity_check').get() as any).integrity_check).toBe('ok');
    } finally { db.close(); }
    // Opening again changes nothing.
    db = openDatabase(path);
    try { expect((db.prepare('SELECT COUNT(*) n FROM apparatus').get() as any).n).toBe(2); } finally { db.close(); }
  });
});
