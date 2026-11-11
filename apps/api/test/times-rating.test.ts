import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { openDatabase, type Db } from '../src/db.js';
import { buildUserSnapshot } from '../src/bug-reports.js';
import { timeStats } from '../src/time-stats.js';
import { insertAdmin, loginAdmin, sessionCookie } from './helpers.js';

type App = Awaited<ReturnType<typeof buildApp>>;

const element = (code: string, timeMs?: number, repetitions = 1) => ({ kind: 'element', code, repetitions, executionTypeName: 'Siatka', ...(timeMs !== undefined && { timeMs }) });
const routine = (timeMs: number | undefined, elementTimes: (number | undefined)[], range: [number, number] = [1, 2]) => ({
  kind: 'routine', sourceRoutineName: 'Układ A', rangeStart: range[0], rangeEnd: range[1], isFullRange: range[0] === 1 && range[1] === 2, repetitions: 1, executionTypeName: 'Siatka',
  ...(timeMs !== undefined && { timeMs }),
  elements: ['40o', '41o'].slice(range[0] - 1, range[1]).map((code, index) => ({ code, position: index + 1, ...(elementTimes[index] !== undefined && { timeMs: elementTimes[index] }) })),
});

describe('czas wykonania i prywatna ocena treningu', () => {
  let db: Db; let app: App; let athlete: string; let athleteId: number; let coach: string;
  beforeEach(async () => {
    db = openDatabase(':memory:');
    app = await buildApp({ db });
    const registered = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { username: 'zawodniczka', password: 'bezpieczne-haslo' } });
    athlete = sessionCookie(registered); athleteId = registered.json().id;
    coach = sessionCookie(await app.inject({ method: 'POST', url: '/api/auth/register', payload: { username: 'trener', password: 'bezpieczne-haslo' } }));
    await app.inject({ method: 'PUT', url: '/api/profile', headers: { cookie: coach }, payload: { athleteEnabled: false, coachEnabled: true } });
    const invitation = (await app.inject({ method: 'POST', url: '/api/coach/invitations', headers: { cookie: athlete }, payload: { role: 'athlete' } })).json();
    await app.inject({ method: 'POST', url: '/api/coach/invitations/accept', headers: { cookie: coach }, payload: { token: invitation.token } });
  });
  afterEach(async () => { await app.close(); db.close(); });
  const save = (payload: object, id?: number) => app.inject({ method: id ? 'PUT' : 'POST', url: id ? `/api/trainings/${id}` : '/api/trainings', headers: { cookie: athlete }, payload });

  it('zapisuje czasy w migawce i przyjmuje je tylko dla pojedynczego wykonania', async () => {
    const saved = await save({ date: '2026-11-01', entries: [{ defaultExecutionTypeName: 'Siatka', activities: [element('40o', 1234), element('40o'), routine(9876, [1500, undefined])] }] });
    expect(saved.statusCode, saved.body).toBe(201);
    const [timed, plain, timedRoutine] = saved.json().entries[0].activities;
    expect(timed.timeMs).toBe(1234); expect(plain.timeMs).toBeNull();
    expect(timedRoutine.timeMs).toBe(9876);
    expect(timedRoutine.elements.map((item: any) => item.timeMs)).toEqual([1500, null]);

    const repeated = await save({ date: '2026-11-01', entries: [{ activities: [element('40o', 1234, 5)] }] });
    expect(repeated.statusCode).toBe(400); expect(repeated.json().message).toContain('pojedynczego wykonania');
    const repeatedRoutine = await save({ date: '2026-11-01', entries: [{ activities: [{ ...routine(undefined, [1500]), repetitions: 2 }] }] });
    expect(repeatedRoutine.statusCode).toBe(400);
    for (const bad of [0, -5, 1.5, 600_001, '1,2']) expect((await save({ date: '2026-11-01', entries: [{ activities: [element('40o', bad as number)] }] })).statusCode).toBe(400);
  });

  it('liczy rekord, średnią, trend i serię oraz zgłasza nowy rekord przy zapisie', async () => {
    await save({ date: '2026-09-01', entries: [{ activities: [element('40o', 1200), element('40o', 1300)] }] });
    const second = await save({ date: '2026-09-10', entries: [{ activities: [element('40o', 1250), routine(9000, [1400, 1100])] }] });
    expect(second.json().newRecords).toEqual([expect.objectContaining({ label: '40o', timeMs: 1400, previousMs: 1300 })]);
    const third = await save({ date: '2026-11-05', entries: [{ activities: [element('40o', 1100), routine(9500, [undefined, undefined]), routine(4000, [undefined], [2, 2])] }] });
    expect(third.json().newRecords).toEqual([expect.objectContaining({ kind: 'routine', label: 'Układ A', timeMs: 9500, previousMs: 9000 })]);

    const stats = timeStats(db, athleteId, undefined, undefined, new Date('2026-11-10T12:00:00Z'));
    const forty = stats.items.find(item => item.key === 'element:40o')!;
    expect(forty).toMatchObject({ count: 5, bestMs: 1400, bestDate: '2026-09-10', avgMs: 1250, lastMs: 1100, lastDate: '2026-11-05', recentAvgMs: 1100, earlierAvgMs: 1288, trendMs: -188 });
    expect(forty.series).toEqual([
      expect.objectContaining({ date: '2026-09-01', count: 2, bestMs: 1300, worstMs: 1200, avgMs: 1250 }),
      expect.objectContaining({ date: '2026-09-10', count: 2, bestMs: 1400, worstMs: 1250 }),
      expect.objectContaining({ date: '2026-11-05', count: 1, bestMs: 1100 }),
    ]);
    expect(stats.items.find(item => item.key === 'element:41o')).toMatchObject({ count: 1, bestMs: 1100 });
    expect(stats.items.find(item => item.label === 'Układ A')).toMatchObject({ kind: 'routine', count: 2, bestMs: 9500 });
    expect(stats.items.find(item => item.label === 'Układ A (poz. 2–2)')).toMatchObject({ count: 1, bestMs: 4000 });
    // Range filter applies to the endpoint too.
    const ranged = (await app.inject({ method: 'GET', url: '/api/stats/times?from=2026-11-01', headers: { cookie: athlete } })).json();
    expect(ranged.items.find((item: any) => item.key === 'element:40o')).toMatchObject({ count: 1, bestMs: 1100 });
  });

  it('ocena i komentarz są widoczne tylko dla zawodnika, nie dla trenera, admina ani w zgłoszeniu', async () => {
    const saved = await save({ date: '2026-11-01', rating: 8, comment: 'Skakało się dobrze', entries: [{ activities: [element('40o', 1234)] }] });
    expect(saved.json()).toMatchObject({ rating: 8, comment: 'Skakało się dobrze' });
    const id = saved.json().id;
    expect((await app.inject({ method: 'GET', url: '/api/trainings', headers: { cookie: athlete } })).json()[0].rating).toBe(8);

    const coachList = await app.inject({ method: 'GET', url: `/api/coach/athletes/${athleteId}/trainings`, headers: { cookie: coach } });
    expect(coachList.statusCode).toBe(200);
    expect(coachList.body).not.toContain('rating'); expect(coachList.body).not.toContain('Skakało');
    const coachTraining = await app.inject({ method: 'GET', url: `/api/coach/athletes/${athleteId}/trainings/${id}`, headers: { cookie: coach } });
    expect(coachTraining.statusCode).toBe(200);
    expect(coachTraining.json().entries[0].activities[0].timeMs).toBe(1234);
    expect(coachTraining.body).not.toContain('rating'); expect(coachTraining.body).not.toContain('Skakało');

    await insertAdmin(db, 'admin', 'haslo-admina');
    const admin = await loginAdmin(app, 'admin', 'haslo-admina');
    const adminTraining = await app.inject({ method: 'GET', url: `/api/admin/users/${athleteId}/trainings/${id}`, headers: { cookie: admin } });
    expect(adminTraining.statusCode).toBe(200);
    expect(adminTraining.body).not.toContain('rating'); expect(adminTraining.body).not.toContain('Skakało');
    expect(JSON.stringify(buildUserSnapshot(db, athleteId))).not.toContain('Skakało');

    // An administrator editing the training cannot change or wipe the private rating.
    const edited = await app.inject({ method: 'PUT', url: `/api/admin/users/${athleteId}/trainings/${id}`, headers: { cookie: admin }, payload: { date: '2026-11-02', rating: 1, comment: 'zmiana', entries: [{ activities: [element('40o')] }] } });
    expect(edited.statusCode).toBe(200);
    expect(db.prepare('SELECT rating,comment FROM trainings WHERE id=?').get(id)).toEqual({ rating: 8, comment: 'Skakało się dobrze' });
  });

  it('zachowuje ocenę, gdy zapis jej nie zawiera, i pozwala ją wyczyścić', async () => {
    const id = (await save({ date: '2026-11-01', rating: 6, comment: 'ok', entries: [] })).json().id;
    expect((await save({ date: '2026-11-03', entries: [] }, id)).json()).toMatchObject({ date: '2026-11-03', rating: 6, comment: 'ok' });
    expect((await save({ date: '2026-11-03', rating: null, comment: '  ', entries: [] }, id)).json()).toMatchObject({ rating: null, comment: null });
    for (const rating of [0, 11, 5.5, '7']) expect((await save({ date: '2026-11-03', rating, entries: [] }, id)).statusCode).toBe(400);
    expect((await save({ date: '2026-11-03', comment: 'x'.repeat(2001), entries: [] }, id)).statusCode).toBe(400);
  });
});
