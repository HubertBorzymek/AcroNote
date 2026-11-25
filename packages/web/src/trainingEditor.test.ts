import { describe, expect, it } from 'vitest';
import { duplicateActivities, duplicateEntries, moveActivity, removeActivities, setLanding, setRepetitions, entrySummary, hasTimes, isWaitingForTime, nextEntryApparatus, nextTimedCopy, routinesForApparatus, splitRepetitions } from './pages/TrainingEditor';
import { statsApparatusChoice } from './pages/StatsPage';
import type { Activity, Apparatus, Routine } from './types';

const element: Activity = { id: '7', type: 'element', repetitions: 5, elementId: '1', elementCode: '40o', executionTypeName: 'Siatka' };
const routine: Activity = { type: 'routine', repetitions: 1, routineId: '2', routineName: 'Układ A', rangeStart: 2, rangeEnd: 3, isFullRoutine: false, executionTypeName: 'Siatka', timeMs: 4200,
  elements: [{ code: '41o', executionTypeName: 'Siatka', timeMs: 1300 }, { code: '800o', executionTypeName: 'Materac' }] };

describe('edytor treningu: czas i zwinięte wejście', () => {
  it('rozdziela powtórzenia na osobne pozycje ×1 bez kopiowania czasu ani id', () => {
    const parts = splitRepetitions({ ...element, timeMs: 1234 });
    expect(parts).toHaveLength(5);
    expect(parts.every((part) => part.repetitions === 1)).toBe(true);
    expect(parts[0]).toMatchObject({ id: '7', timeMs: 1234 });
    expect(parts.slice(1).every((part) => part.id === undefined && part.timeMs === null && part.elementCode === '40o')).toBe(true);
  });
  it('kolejne wykonanie na czas jest puste i ×1, także dla elementów układu', () => {
    const copy = nextTimedCopy(routine);
    expect(copy).toMatchObject({ repetitions: 1, timeMs: null, rangeStart: 2, rangeEnd: 3 });
    expect(copy.elements?.map((item) => item.timeMs)).toEqual([null, null]);
    expect(hasTimes(routine)).toBe(true); expect(hasTimes(copy)).toBe(false);
  });
  it('po rozdzieleniu przechodzi do następnej pustej pozycji zamiast dodawać nową', () => {
    const [first, second] = splitRepetitions({ ...element, timeMs: 1234 });
    expect(isWaitingForTime(second, first!)).toBe(true);
    expect(isWaitingForTime({ ...second!, timeMs: 1100 }, first!)).toBe(false);
    expect(isWaitingForTime({ ...second!, elementCode: '41o' }, first!)).toBe(false);
    expect(isWaitingForTime({ ...second!, repetitions: 2 }, first!)).toBe(false);
    expect(isWaitingForTime(undefined, first!)).toBe(false);
  });
  it('streszcza zwinięte wejście w jednej linii', () => {
    expect(entrySummary({ defaultExecutionTypeName: 'Siatka', activities: [element, { ...element, repetitions: 1, timeMs: 1234 }, routine] }))
      .toBe('40o ×5 · 40o 1,234 s · Układ A 2–3 4,2 s');
    expect(entrySummary({ defaultExecutionTypeName: 'Siatka', activities: [] })).toBe('Brak czynności');
  });
});

const apparatus: Apparatus[] = [
  { id: '1', name: 'Trampolina', catalog: 'trampoline', tracksTime: true },
  { id: '2', name: 'DMT', catalog: 'trampoline', tracksTime: false },
  { id: '3', name: 'Stara', catalog: 'trampoline', tracksTime: false, hidden: true },
];

describe('sprzęt w wejściach i statystykach', () => {
  it('pierwsze wejście dostaje domyślny sprzęt, kolejne sprzęt poprzedniego', () => {
    expect(nextEntryApparatus([], apparatus)?.name).toBe('Trampolina');
    expect(nextEntryApparatus([{ defaultExecutionTypeName: 'Siatka', apparatusId: '2', activities: [] }], apparatus)?.name).toBe('DMT');
    // A hidden (or removed) apparatus is not continued: back to the default.
    expect(nextEntryApparatus([{ defaultExecutionTypeName: 'Siatka', apparatusId: '3', activities: [] }], apparatus)?.name).toBe('Trampolina');
    expect(nextEntryApparatus([], [])).toBeUndefined();
  });

  it('w wejściu są tylko układy jego sprzętu', () => {
    const routines: Routine[] = [{ id: 'a', name: 'Układ', slots: [], apparatusId: '1' }, { id: 'b', name: 'Podejście', slots: [], apparatusId: '2' }, { id: 'c', name: 'Bez sprzętu', slots: [] }];
    expect(routinesForApparatus(routines, '2').map((item) => item.id)).toEqual(['b', 'c']);
    expect(routinesForApparatus(routines, undefined).map((item) => item.id)).toEqual(['a', 'b', 'c']);
  });

  it('statystyki pamiętają wybór, a bez niego pokazują domyślny sprzęt', () => {
    expect(statsApparatusChoice(apparatus, null)).toBe('1');
    expect(statsApparatusChoice(apparatus, '2')).toBe('2');
    expect(statsApparatusChoice(apparatus, 'all')).toBe('all');
    expect(statsApparatusChoice(apparatus, '3')).toBe('1');
    expect(statsApparatusChoice([apparatus[0]], '2')).toBe('all');
  });
});

describe('duplikowanie zaznaczonych wejść', () => {
  it('kopiuje zaznaczone wejścia na koniec (na górę listy), bez id i bez czasów', () => {
    const entries = [
      { id: '1', clientKey: 'a', defaultExecutionTypeName: 'Siatka', apparatusId: '2', apparatusName: 'DMT', unfinished: true, activities: [{ ...element, id: '9', repetitions: 1, timeMs: 1234 }] },
      { id: '2', clientKey: 'b', defaultExecutionTypeName: 'Materac', activities: [{ id: '10', type: 'routine' as const, repetitions: 1, routineName: 'U', executionTypeName: 'Siatka', timeMs: 5000, elements: [{ code: '40o', executionTypeName: 'Siatka', timeMs: 900 }] }] },
      { id: '3', clientKey: 'c', defaultExecutionTypeName: 'Siatka', activities: [] },
    ];
    let n = 0;
    const result = duplicateEntries(entries, new Set(['a', 'b']), () => `nowy-${++n}`);
    expect(result).toHaveLength(5);
    expect(result.slice(0, 3)).toEqual(entries);
    const [copyA, copyB] = result.slice(3);
    expect(copyA).toMatchObject({ id: undefined, clientKey: 'nowy-1', apparatusId: '2', apparatusName: 'DMT', unfinished: true, defaultExecutionTypeName: 'Siatka' });
    expect(copyA.activities[0]).toMatchObject({ id: undefined, elementCode: '40o', timeMs: null });
    expect(copyB.activities[0]).toMatchObject({ timeMs: null, elements: [{ code: '40o', timeMs: null }] });
    // The originals keep their times.
    expect(entries[0].activities[0].timeMs).toBe(1234);
  });
});

describe('zaznaczone pozycje w jednym wejściu', () => {
  const activities: Activity[] = [
    { ...element, id: 'a', repetitions: 2 },
    { ...element, id: 'b', repetitions: 1, elementCode: '41o', timeMs: 1234 },
    { ...routine, id: 'c', timeMs: null, elements: [{ code: '41o', executionTypeName: 'Siatka' }, { code: '800o', executionTypeName: 'Materac' }] },
    { ...element, id: 'd', repetitions: 3, elementCode: '800<' },
  ];

  it('ustawia liczbę wykonań i pomija pozycje z czasem', () => {
    const result = setRepetitions(activities, new Set([0, 1, 2]), 4);
    expect(result.skipped).toBe(1);
    expect(result.activities.map((item) => item.repetitions)).toEqual([4, 1, 4, 3]);
    expect(result.activities[1]).toBe(activities[1]);
    expect(result.activities[3]).toBe(activities[3]);
    // A time in one routine element is also a single execution.
    expect(setRepetitions([routine], new Set([0]), 3).skipped).toBe(1);
  });

  it('ustawia lądowanie pozycji i każdego elementu układu', () => {
    const result = setLanding(activities, new Set([2, 3]), { id: 'mat', name: 'Materac' });
    expect(result[2]).toMatchObject({ executionTypeId: 'mat', executionTypeName: 'Materac' });
    expect(result[2].elements?.map((item) => item.executionTypeName)).toEqual(['Materac', 'Materac']);
    expect(result[3]).toMatchObject({ executionTypeId: 'mat', executionTypeName: 'Materac' });
    expect(result[0]).toBe(activities[0]);
    // The original snapshot objects are untouched.
    expect(activities[2].elements?.[0].executionTypeName).toBe('Siatka');
  });

  it('duplikuje zaznaczone na koniec wejścia, bez id i czasów', () => {
    const result = duplicateActivities(activities, new Set([1, 0]));
    expect(result.map((item) => item.elementCode ?? item.routineName)).toEqual(['40o', '41o', 'Układ A', '800<', '40o', '41o']);
    expect(result.slice(4).every((item) => item.id === undefined && item.timeMs === null)).toBe(true);
    expect(result[4].repetitions).toBe(2);
    expect(activities[1].timeMs).toBe(1234);
  });

  it('usuwa zaznaczone i przestawia kolejność', () => {
    expect(removeActivities(activities, new Set([0, 2])).map((item) => item.id)).toEqual(['b', 'd']);
    expect(moveActivity(activities, 3, 0).map((item) => item.id)).toEqual(['d', 'a', 'b', 'c']);
    expect(moveActivity(activities, 0, 2).map((item) => item.id)).toEqual(['b', 'c', 'a', 'd']);
    expect(moveActivity(activities, 1, 1)).toBe(activities);
    expect(moveActivity(activities, -1, 2)).toBe(activities);
    expect(moveActivity(activities, 0, 9)).toBe(activities);
  });
});
