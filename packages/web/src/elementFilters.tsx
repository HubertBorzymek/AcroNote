import type { ElementItem } from './types';
import { formatTwists, parseCatalogCode, type BodyPosition, type Catalog, standardElementName } from './elementCode';

export interface ElementFilters {
  favoriteOnly: boolean;
  somersaults: string;
  twists: string;
  direction: string;
  position: 'all' | BodyPosition;
}

export const emptyElementFilters: ElementFilters = { favoriteOnly: false, somersaults: 'all', twists: 'all', direction: 'all', position: 'all' };

export const catalogOf = (item: Pick<ElementItem, 'catalog'>): Catalog => item.catalog ?? 'trampoline';
export const elementsOfCatalog = <T extends Pick<ElementItem, 'catalog'>>(elements: T[], catalog: Catalog) => elements.filter((item) => catalogOf(item) === catalog);
/** Own name, else the standard name (kuczka, rundak…). */
export const elementLabel = (item: Pick<ElementItem, 'code' | 'name' | 'catalog'>, fallback = 'Bez nazwy') => item.name || standardElementName(item.code, catalogOf(item)) || fallback;

/** Search by code, own name or standard name, plus the code filters (read in the element's own notation). */
export function elementMatches(item: ElementItem, query: string, filters: ElementFilters): boolean {
  const parsed = parseCatalogCode(item.code, catalogOf(item));
  return `${item.code} ${item.name ?? ''} ${standardElementName(item.code, catalogOf(item)) ?? ''}`.toLocaleLowerCase('pl').includes(query.toLocaleLowerCase('pl'))
    && (!filters.favoriteOnly || item.favorite)
    && (filters.somersaults === 'all' || parsed?.somersaults === Number(filters.somersaults))
    && (filters.twists === 'all' || parsed?.totalTwists === Number(filters.twists))
    && (filters.direction === 'all' || parsed?.direction === filters.direction)
    && (filters.position === 'all' || parsed?.position === filters.position);
}

export function filterElementChoices(elements: ElementItem[], query: string, filters: ElementFilters): ElementItem[] {
  return elements.filter((item) => elementMatches(item, query, filters)).sort((a, b) => Number(b.favorite) - Number(a.favorite) || a.code.localeCompare(b.code, 'pl'));
}

/** Salto, twist, direction and position selects; tumbling has up to 4 somersaults and side elements. */
export function ElementFilterSelects({ value, onChange, catalog = 'trampoline' }: { value: ElementFilters; onChange: (value: ElementFilters) => void; catalog?: Catalog }) {
  const saltos = catalog === 'tumbling' ? [1, 2, 3, 4] : [1, 2, 3];
  return <>
    <select aria-label="Liczba salt" value={value.somersaults} onChange={(event) => onChange({ ...value, somersaults: event.target.value })}><option value="all">Wszystkie salta</option><option value="0">Element bez salta</option>{saltos.map((count) => <option key={count} value={count}>{count} {count === 1 ? 'salto' : 'salta'}</option>)}</select>
    <select aria-label="Suma śrub" value={value.twists} onChange={(event) => onChange({ ...value, twists: event.target.value })}><option value="all">Wszystkie śruby</option>{Array.from({ length: 7 }, (_, index) => index / 2).map((count) => <option key={count} value={count}>{formatTwists(count)} śruby</option>)}</select>
    <select aria-label="Kierunek" value={value.direction} onChange={(event) => onChange({ ...value, direction: event.target.value })}><option value="all">{catalog === 'tumbling' ? 'Każdy kierunek' : 'Przód i tył'}</option><option>Przód</option><option>Tył</option>{catalog === 'tumbling' && <option>Bok</option>}</select>
    <select aria-label="Pozycja" value={value.position} onChange={(event) => onChange({ ...value, position: event.target.value as ElementFilters['position'] })}><option value="all">Każda pozycja</option><option value="o">Kuczna (o)</option><option value="<">Łamana (&lt;)</option><option value="/">Prosta (/)</option></select>
  </>;
}

export function ElementFilterControls({ value, onChange, catalog = 'trampoline' }: { value: ElementFilters; onChange: (value: ElementFilters) => void; catalog?: Catalog }) {
  return <div className="picker-filters">
    <button type="button" className={value.favoriteOnly ? 'active' : ''} aria-pressed={value.favoriteOnly} onClick={() => onChange({ ...value, favoriteOnly: !value.favoriteOnly })}>★ Ulubione</button>
    <ElementFilterSelects value={value} onChange={onChange} catalog={catalog}/>
  </div>;
}
