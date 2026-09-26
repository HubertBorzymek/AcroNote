import { describe, expect, it } from 'vitest';
import { emptyElementFilters, filterElementChoices } from './elementFilters';
import type { ElementItem } from './types';

const elements: ElementItem[] = [
  { id: '1', code: '41o', name: 'Barani', favorite: true, hidden: false },
  { id: '2', code: '800/', name: 'Podwójne', favorite: false, hidden: false },
  { id: '3', code: '831<', name: 'Podwójne śrubowe', favorite: false, hidden: false },
];

describe('filtry w selektorach elementów', () => {
  it('łączy wyszukiwanie z filtrami kodu', () => {
    expect(filterElementChoices(elements, 'podwójne', { ...emptyElementFilters, somersaults: '2', direction: 'Tył', position: '/' }).map((item) => item.id)).toEqual(['2']);
  });

  it('potrafi ograniczyć listę do ulubionych i sumy śrub', () => {
    expect(filterElementChoices(elements, '', { ...emptyElementFilters, favoriteOnly: true, twists: '0.5' }).map((item) => item.id)).toEqual(['1']);
  });
});
