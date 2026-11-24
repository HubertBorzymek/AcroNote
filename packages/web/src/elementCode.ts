export type BodyPosition = 'o' | '<' | '/';
/** Zapis elementów: trampolinowy (trampolina, DMT; liczbowy FIG) albo ścieżkowy (symbole FIG). */
export type Catalog = 'trampoline' | 'tumbling';

export interface ParsedElementCode {
  quarterTurns: number;
  somersaults: number;
  totalTwists: number;
  /** Null for an element without a somersault (o, <, / on the trampoline; ( F H X ^ on tumbling). */
  direction: 'Przód' | 'Tył' | 'Bok' | null;
  /** Null when the code does not say it (tumbling twisting elements, special elements). */
  position: BodyPosition | null;
  positionName: 'Kuczna' | 'Łamana' | 'Prosta' | null;
  /** Tumbling special element: rundak, flik… */
  specialName?: string;
}

const positionNames: Record<BodyPosition, 'Kuczna' | 'Łamana' | 'Prosta'> = { o: 'Kuczna', '<': 'Łamana', '/': 'Prosta' };

/** Interpretuje kod FIG używany w aplikacji, np. 41o, 831<, 12001/, a także element bez salta: o, <, /. */
export function parseElementCode(value: string): ParsedElementCode | null {
  const code = value.trim();
  if (code.length === 1 && isPosition(code.toLowerCase())) {
    const position = code.toLowerCase() as BodyPosition;
    return { quarterTurns: 0, somersaults: 0, totalTwists: 0, direction: null, position, positionName: positionNames[position] };
  }
  const position = code.at(-1)?.toLowerCase() as BodyPosition;
  if (!isPosition(position)) return null;
  const digits = code.slice(0, -1);
  if (!/^\d+$/.test(digits)) return null;
  const matches: ParsedElementCode[] = [];
  for (const prefixLength of [1, 2]) {
    if (digits.length <= prefixLength) continue;
    const quarterTurns = Number(digits.slice(0, prefixLength));
    if (quarterTurns < 1 || quarterTurns > 12) continue;
    // Filters keep whole somersaults (1¾ = 1 salto); the twist digits may follow whole or started somersaults (70o, 700o).
    const somersaults = Math.max(1, Math.floor(quarterTurns / 4));
    const twists = digits.slice(prefixLength);
    if (twists.length !== somersaults && twists.length !== Math.ceil(quarterTurns / 4)) continue;
    const totalTwists = [...twists].reduce((sum, digit) => sum + Number(digit) / 2, 0);
    matches.push({ quarterTurns, somersaults, totalTwists, direction: Number.isInteger(totalTwists) ? 'Tył' : 'Przód', position, positionName: positionNames[position] });
  }
  return matches.length === 1 ? matches[0] : null;
}

export const tumblingSpecials: Record<string, string> = { '(': 'Rundak', F: 'Flik', H: 'Przerzut w przód', X: 'Przerzut bokiem', '^': 'Tempo' };

/**
 * Zapis ścieżkowy FIG: cyfra na każde salto (półśruby w nim), pozycja o < / (bez śruby wymagana),
 * kropka przed = przód (.0o, .1), kropka po = tył ze śrubą (1., 2./), bez kropki = tył (0o, 00/),
 * x na końcu = bok (0ox). Spacje są pomijane. Elementy specjalne: ( F H X ^.
 * Ta sama logika co parseTumblingCode w @acronote/shared (sprawdzają ją testy po obu stronach).
 */
export function parseTumblingCode(value: string): ParsedElementCode | null {
  const compact = value.replace(/\s+/g, '');
  if (compact.length === 1) {
    const symbol = compact === '(' || compact === '^' ? compact : compact.toUpperCase();
    if (tumblingSpecials[symbol]) return { quarterTurns: 0, somersaults: 0, totalTwists: 0, direction: null, position: null, positionName: null, specialName: tumblingSpecials[symbol] };
  }
  const match = /^(\.)?(\d{1,4})(\.)?([o<\/])?(x)?$/i.exec(compact);
  if (!match) return null;
  const [, front, digits, backDot, shapeText, side] = match;
  const shape = shapeText?.toLowerCase() as BodyPosition | undefined;
  const halves = [...digits].reduce((sum, digit) => sum + Number(digit), 0);
  if (front && backDot) return null;
  if (side && (front || backDot || !shape)) return null;
  if (halves === 0 && (!shape || backDot)) return null;
  return { quarterTurns: digits.length * 4, somersaults: digits.length, totalTwists: halves / 2, direction: side ? 'Bok' : front ? 'Przód' : 'Tył', position: shape ?? null, positionName: shape ? positionNames[shape] : null };
}

export function parseCatalogCode(value: string, catalog: Catalog = 'trampoline'): ParsedElementCode | null {
  return catalog === 'tumbling' ? parseTumblingCode(value) : parseElementCode(value);
}

const jumpNames: Record<BodyPosition, string> = { o: 'Kuczka', '<': 'Rozkroczka', '/': 'Poziomka' };

/** Nazwa zwyczajowa elementu bez salta (o, <, / na trampolinie; ( F H X ^ na ścieżce), pokazywana, gdy nie ma własnej. Nie jest zapisywana. */
export function standardElementName(code: string, catalog: Catalog = 'trampoline'): string | null {
  const parsed = parseCatalogCode(code, catalog);
  if (!parsed || parsed.somersaults !== 0) return null;
  return parsed.specialName ?? (parsed.position ? jumpNames[parsed.position] : null);
}

function isPosition(value: string | undefined): value is BodyPosition {
  return value === 'o' || value === '<' || value === '/';
}

/** Krótki opis kodu pod polem formularza; null dla kodu spoza notacji. */
export function describeElementCode(value: string, catalog: Catalog = 'trampoline'): string | null {
  const code = parseCatalogCode(value, catalog);
  if (!code) return null;
  if (code.somersaults === 0) return `${standardElementName(value, catalog)} · element bez salta`;
  const saltos = code.somersaults === 1 ? 'salto' : 'salta';
  return [`${code.somersaults} ${saltos}`, `${formatTwists(code.totalTwists)} śruby`, code.direction!.toLowerCase(), code.positionName?.toLowerCase()].filter(Boolean).join(' · ');
}

export function formatTwists(value: number) {
  return Number.isInteger(value) ? String(value) : value.toLocaleString('pl-PL', { maximumFractionDigits: 1 });
}

export const catalogNames: Record<Catalog, string> = { trampoline: 'Trampolina / DMT', tumbling: 'Ścieżka' };
