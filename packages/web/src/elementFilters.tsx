import type { ElementItem } from './types';
import { formatTwists, parseElementCode, type BodyPosition } from './elementCode';

export interface ElementFilters {
  favoriteOnly: boolean;
  somersaults: string;
  twists: string;
  direction: string;
  position: 'all' | BodyPosition;
}

export const emptyElementFilters: ElementFilters = { favoriteOnly: false, somersaults: 'all', twists: 'all', direction: 'all', position: 'all' };

export function filterElementChoices(elements: ElementItem[], query: string, filters: ElementFilters): ElementItem[] {
  const normalizedQuery = query.toLocaleLowerCase('pl');
  return elements.filter((item) => {
    const parsed = parseElementCode(item.code);
    return `${item.code} ${item.name ?? ''}`.toLocaleLowerCase('pl').includes(normalizedQuery)
      && (!filters.favoriteOnly || item.favorite)
      && (filters.somersaults === 'all' || parsed?.somersaults === Number(filters.somersaults))
      && (filters.twists === 'all' || parsed?.totalTwists === Number(filters.twists))
      && (filters.direction === 'all' || parsed?.direction === filters.direction)
      && (filters.position === 'all' || parsed?.position === filters.position);
  }).sort((a, b) => Number(b.favorite) - Number(a.favorite) || a.code.localeCompare(b.code, 'pl'));
}

export function ElementFilterControls({ value, onChange }: { value: ElementFilters; onChange: (value: ElementFilters) => void }) {
  return <div className="picker-filters">
    <button type="button" className={value.favoriteOnly ? 'active' : ''} aria-pressed={value.favoriteOnly} onClick={() => onChange({ ...value, favoriteOnly: !value.favoriteOnly })}>★ Ulubione</button>
    <select aria-label="Liczba salt" value={value.somersaults} onChange={(event) => onChange({ ...value, somersaults: event.target.value })}><option value="all">Wszystkie salta</option>{[1, 2, 3].map((count) => <option key={count} value={count}>{count} {count === 1 ? 'salto' : 'salta'}</option>)}</select>
    <select aria-label="Suma śrub" value={value.twists} onChange={(event) => onChange({ ...value, twists: event.target.value })}><option value="all">Wszystkie śruby</option>{Array.from({ length: 7 }, (_, index) => index / 2).map((count) => <option key={count} value={count}>{formatTwists(count)} śruby</option>)}</select>
    <select aria-label="Kierunek" value={value.direction} onChange={(event) => onChange({ ...value, direction: event.target.value })}><option value="all">Przód i tył</option><option>Przód</option><option>Tył</option></select>
    <select aria-label="Pozycja" value={value.position} onChange={(event) => onChange({ ...value, position: event.target.value as ElementFilters['position'] })}><option value="all">Każda pozycja</option><option value="o">Kuczna (o)</option><option value="<">Łamana (&lt;)</option><option value="/">Prosta (/)</option></select>
  </div>;
}
