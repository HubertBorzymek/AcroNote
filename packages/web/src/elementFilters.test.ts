import { describe, expect, it } from 'vitest';
import { elementLabel, elementsOfCatalog, emptyElementFilters, filterElementChoices } from './elementFilters';
import { availableCatalogs } from './pages/ElementsPage';
import type { ElementItem } from './types';

const elements: ElementItem[] = [
  { id: '1', code: '41o', name: 'Barani', favorite: true, hidden: false },
  { id: '2', code: '800/', name: 'Podwójne', favorite: false, hidden: false },
  { id: '3', code: '831<', name: 'Podwójne śrubowe', favorite: false, hidden: false },
  { id: '4', code: '/', name: null, favorite: false, hidden: false },
  { id: '5', code: '4o', name: 'Własny kod', favorite: false, hidden: false },
];

describe('filtry w selektorach elementów', () => {
  it('łączy wyszukiwanie z filtrami kodu', () => {
    expect(filterElementChoices(elements, 'podwójne', { ...emptyElementFilters, somersaults: '2', direction: 'Tył', position: '/' }).map((item) => item.id)).toEqual(['2']);
  });

  it('filtr „Element bez salta” pokazuje o, <, /, a kod spoza notacji tylko bez filtrów kodu', () => {
    expect(filterElementChoices(elements, 'poziomka', emptyElementFilters).map((item) => item.id)).toEqual(['4']);
    expect(filterElementChoices(elements, '', { ...emptyElementFilters, somersaults: '0' }).map((item) => item.id)).toEqual(['4']);
    expect(filterElementChoices(elements, '', { ...emptyElementFilters, direction: 'Tył' }).map((item) => item.id)).toEqual(['2', '3']);
    expect(filterElementChoices(elements, 'własny', emptyElementFilters).map((item) => item.id)).toEqual(['5']);
  });

  it('potrafi ograniczyć listę do ulubionych i sumy śrub', () => {
    expect(filterElementChoices(elements, '', { ...emptyElementFilters, favoriteOnly: true, twists: '0.5' }).map((item) => item.id)).toEqual(['1']);
  });
});

describe('dwa zapisy elementów', () => {
  const mixed: ElementItem[] = [
    { id: 't1', code: '40o', favorite: false, hidden: false },
    { id: 's1', code: '40o', favorite: false, hidden: false, catalog: 'tumbling' },
    { id: 's2', code: '(', favorite: false, hidden: false, catalog: 'tumbling' },
    { id: 's3', code: '0ox', name: 'Bokiem', favorite: false, hidden: false, catalog: 'tumbling' },
  ];

  it('każdy element czyta się w jego własnym zapisie', () => {
    // 40o: one somersault on the trampoline, two somersaults (double full in) on tumbling.
    expect(filterElementChoices(mixed, '', { ...emptyElementFilters, somersaults: '2' }).map((item) => item.id)).toEqual(['s1']);
    expect(filterElementChoices(mixed, '', { ...emptyElementFilters, direction: 'Bok' }).map((item) => item.id)).toEqual(['s3']);
    expect(filterElementChoices(mixed, 'rundak', emptyElementFilters).map((item) => item.id)).toEqual(['s2']);
    expect(elementsOfCatalog(mixed, 'trampoline').map((item) => item.id)).toEqual(['t1']);
    expect(elementLabel(mixed[2])).toBe('Rundak');
  });

  it('zakładki zapisu: sprzęty widoczne i zapisy, w których są już elementy', () => {
    const trampolineOnly = [{ id: '1', name: 'Trampolina', catalog: 'trampoline' as const, tracksTime: true }, { id: '3', name: 'Ścieżka', catalog: 'tumbling' as const, tracksTime: false, hidden: true }];
    expect(availableCatalogs(trampolineOnly, [mixed[0]])).toEqual(['trampoline']);
    expect(availableCatalogs(trampolineOnly, mixed)).toEqual(['trampoline', 'tumbling']);
    expect(availableCatalogs([{ ...trampolineOnly[1], hidden: false }], [])).toEqual(['tumbling']);
  });
});
