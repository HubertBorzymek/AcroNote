import { describe, expect, it } from 'vitest';
import { entrySummary, hasTimes, isWaitingForTime, nextTimedCopy, splitRepetitions } from './pages/TrainingEditor';
import type { Activity } from './types';

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
