import { describe, expect, it } from 'vitest';
import { newestEntryIndexes } from './TrainingEditor';

describe('kolejność i zwijanie wejść treningu', () => {
  it('domyślnie wybiera pięć najnowszych wejść od najnowszego', () => {
    expect(newestEntryIndexes(12, 5)).toEqual([11, 10, 9, 8, 7]);
  });

  it('po rozwinięciu zachowuje malejącą kolejność i nie wychodzi poza listę', () => {
    expect(newestEntryIndexes(12, 10)).toEqual([11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
    expect(newestEntryIndexes(3, 5)).toEqual([2, 1, 0]);
  });
});
