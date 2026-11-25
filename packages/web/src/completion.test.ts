import { describe, expect, it } from 'vitest';
import { completedText, mostReliable, percent, successText } from './completion';

describe('ukończone wejścia i skuteczność (tylko pozytywne ujęcie)', () => {
  it('opisuje ukończone wejścia tylko wtedy, gdy jakieś były nieukończone', () => {
    expect(completedText(9, 1)).toBe('ukończone 8 z 9');
    expect(completedText(9, 0)).toBeNull();
    expect(completedText(0, 0)).toBeNull();
    expect(percent(8, 9)).toBe(89);
  });

  it('podaje udane próby elementu', () => {
    expect(successText(13, 1)).toBe('udane 12 z 13 (92%)');
    expect(successText(0, 0)).toBeNull();
  });

  it('najpewniejsze elementy: od najlepszego, z minimalną liczbą prób', () => {
    const items = [{ key: 'a', count: 10, failed: 1 }, { key: 'b', count: 2, failed: 0 }, { key: 'c', count: 20, failed: 0 }, { key: 'd', count: 5, failed: 0 }, { key: 'e', count: 4, failed: 2 }];
    expect(mostReliable(items).map((item) => item.key)).toEqual(['c', 'd', 'a', 'e']);
    expect(mostReliable(items, 3, 2).map((item) => item.key)).toEqual(['c', 'd']);
  });
});
