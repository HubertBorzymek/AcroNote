export type ElementDirection = 'front' | 'back';
export type ElementPosition = 'tuck' | 'pike' | 'straight';

export interface ParsedElementCode {
  code: string;
  quarterCount: number;
  saltoCount: number;
  twistDigits: number[];
  totalTwistHalves: number;
  totalTwists: number;
  /** Null for a jump without a somersault (o, <, /): it has no direction. */
  direction: ElementDirection | null;
  position: ElementPosition;
  positionSymbol: 'o' | '<' | '/';
}

const positions: Record<string, ElementPosition> = { o: 'tuck', '<': 'pike', '/': 'straight' };

export const MAX_ELEMENT_CODE_LENGTH = 20;

/**
 * How many twist digits a quarter count takes. For partial somersaults both forms are accepted:
 * one digit per started somersault (7 quarters = 1¾ → 700o) and the older/FIG form with whole
 * somersaults (70o, 901<). With full somersaults both are the same. A code never matches two ways.
 */
export function twistDigitCounts(quarterCount: number): number[] {
  const whole = Math.max(1, Math.floor(quarterCount / 4));
  const started = Math.ceil(quarterCount / 4);
  return whole === started ? [whole] : [whole, started];
}

/** Parses the complete AcroNote notation. It deliberately accepts no shorthand. */
export function parseElementCode(value: unknown): ParsedElementCode | null {
  if (typeof value !== 'string') return null;
  const code = value.trim();
  // A bare position symbol is a jump without somersault or twist (o, <, /).
  if (/^[o<\/]$/i.test(code)) {
    const positionSymbol = code.toLowerCase() as 'o' | '<' | '/';
    return { code: positionSymbol, quarterCount: 0, saltoCount: 0, twistDigits: [], totalTwistHalves: 0, totalTwists: 0, direction: null, position: positions[positionSymbol]!, positionSymbol };
  }
  const match = /^(\d+)([o<\/])$/i.exec(code);
  if (!match) return null;
  const digits = match[1]!;
  const positionSymbol = match[2]!.toLowerCase() as 'o' | '<' | '/';
  const candidates: Array<{ quarterCount: number; twistDigits: number[] }> = [];

  // Quarter counts currently cover one to three somersaults. Testing every
  // possible prefix avoids incorrectly treating 12 as 1 quarter + twist 2.
  for (const prefixLength of [1, 2]) {
    if (digits.length <= prefixLength) continue;
    const quarterText = digits.slice(0, prefixLength);
    if (quarterText.startsWith('0')) continue;
    const quarterCount = Number(quarterText);
    if (!Number.isInteger(quarterCount) || quarterCount < 1 || quarterCount > 12) continue;
    const twistText = digits.slice(prefixLength);
    if (!twistDigitCounts(quarterCount).includes(twistText.length)) continue;
    candidates.push({ quarterCount, twistDigits: [...twistText].map(Number) });
  }
  if (candidates.length !== 1) return null;
  const candidate = candidates[0]!;
  const saltoCount = Math.max(1, Math.floor(candidate.quarterCount / 4));
  const totalTwistHalves = candidate.twistDigits.reduce((sum, digit) => sum + digit, 0);
  return {
    code: `${digits}${positionSymbol}`,
    quarterCount: candidate.quarterCount,
    saltoCount,
    twistDigits: candidate.twistDigits,
    totalTwistHalves,
    totalTwists: totalTwistHalves / 2,
    direction: totalTwistHalves % 2 === 0 ? 'back' : 'front',
    position: positions[positionSymbol]!,
    positionSymbol
  };
}

export const INVALID_ELEMENT_CODE_MESSAGE = 'Kod elementu jest nieprawidłowy. Użyj pełnego kodu zakończonego znakiem o, < lub /.';

export function validateElementCode(value: unknown): ParsedElementCode {
  const parsed = parseElementCode(value);
  if (!parsed) throw new Error(INVALID_ELEMENT_CODE_MESSAGE);
  return parsed;
}

/** Element notation of a catalog: trampoline/DMT (FIG numeric) or tumbling (FIG symbols). */
export type ElementCatalog = 'trampoline' | 'tumbling';
export const ELEMENT_CATALOGS: readonly ElementCatalog[] = ['trampoline', 'tumbling'];

/** Tumbling elements without a somersault and their Polish names. */
export const TUMBLING_SPECIALS = { '(': 'Rundak', F: 'Flik', H: 'Przerzut w przód', X: 'Przerzut bokiem', '^': 'Tempo' } as const;
export type TumblingSpecial = keyof typeof TUMBLING_SPECIALS;

export interface ParsedTumblingCode {
  code: string;
  special: TumblingSpecial | null;
  saltoCount: number;
  twistDigits: number[];
  totalTwistHalves: number;
  totalTwists: number;
  direction: ElementDirection | 'side' | null;
  position: ElementPosition | null;
  positionSymbol: 'o' | '<' | '/' | null;
}

/**
 * FIG tumbling symbols: one digit per somersault (half twists in it), an optional position
 * (o, <, /; required without twists), a dot before = forward (.0o, .1), a dot after = backward
 * with twist (1., 2./), no dot = backward (0o, 00/, 22o), x at the end = side (0ox).
 * Spaces are ignored ("0 0 /" = "00/"). Special elements: ( F H X ^.
 */
export function parseTumblingCode(value: unknown): ParsedTumblingCode | null {
  if (typeof value !== 'string') return null;
  const compact = value.replace(/\s+/g, '');
  if (compact.length === 1) {
    const symbol = (compact === '(' || compact === '^' ? compact : compact.toUpperCase()) as TumblingSpecial;
    if (symbol in TUMBLING_SPECIALS) return { code: symbol, special: symbol, saltoCount: 0, twistDigits: [], totalTwistHalves: 0, totalTwists: 0, direction: null, position: null, positionSymbol: null };
  }
  const match = /^(\.)?(\d{1,4})(\.)?([o<\/])?(x)?$/i.exec(compact);
  if (!match) return null;
  const [, front, digits, backDot, shapeText, sideText] = match;
  const shape = shapeText?.toLowerCase() as 'o' | '<' | '/' | undefined;
  const side = Boolean(sideText);
  const twistDigits = [...digits!].map(Number);
  const totalTwistHalves = twistDigits.reduce((sum, digit) => sum + digit, 0);
  if (front && backDot) return null;
  if (side && (front || backDot || !shape)) return null;
  // Without twists the position is the whole description, and a "back" dot means nothing.
  if (totalTwistHalves === 0 && (!shape || backDot)) return null;
  return {
    code: `${front ? '.' : ''}${digits}${backDot ? '.' : ''}${shape ?? ''}${side ? 'x' : ''}`,
    special: null, saltoCount: digits!.length, twistDigits, totalTwistHalves, totalTwists: totalTwistHalves / 2,
    direction: side ? 'side' : front ? 'front' : 'back',
    position: shape ? positions[shape]! : null, positionSymbol: shape ?? null,
  };
}

/** The derived catalog columns of an element (filters), whatever its notation. */
export interface ElementCodeFields {
  code: string;
  quarterCount: number;
  saltoCount: number;
  totalTwistHalves: number;
  totalTwists: number;
  direction: ElementDirection | 'side' | null;
  positionSymbol: 'o' | '<' | '/' | null;
}

export function parseCatalogCode(catalog: ElementCatalog, value: unknown): ElementCodeFields | null {
  if (catalog === 'tumbling') {
    const parsed = parseTumblingCode(value);
    return parsed && { code: parsed.code, quarterCount: parsed.saltoCount * 4, saltoCount: parsed.saltoCount, totalTwistHalves: parsed.totalTwistHalves, totalTwists: parsed.totalTwists, direction: parsed.direction, positionSymbol: parsed.positionSymbol };
  }
  const parsed = parseElementCode(value);
  return parsed && { code: parsed.code, quarterCount: parsed.quarterCount, saltoCount: parsed.saltoCount, totalTwistHalves: parsed.totalTwistHalves, totalTwists: parsed.totalTwists, direction: parsed.direction, positionSymbol: parsed.positionSymbol };
}

export const INVALID_TUMBLING_CODE_MESSAGE = 'Kod elementu jest nieprawidłowy w zapisie ścieżkowym. Przykłady: 0o, .0<, 1., 22/, ( F ^.';

export interface CheckedElementCode {
  code: string;
  /** Null when the user confirmed a code outside the notation. */
  parsed: ElementCodeFields | null;
}

/**
 * Accepts a code from the user in the notation of the catalog. A code outside the notation is
 * accepted only when the user confirmed it (allowNonStandard); it is stored as typed and has
 * no derived fields.
 */
export function checkElementCode(value: unknown, allowNonStandard: boolean, catalog: ElementCatalog = 'trampoline'): CheckedElementCode {
  const parsed = parseCatalogCode(catalog, value);
  if (parsed) return { code: parsed.code, parsed };
  if (!allowNonStandard) throw new Error(catalog === 'tumbling' ? INVALID_TUMBLING_CODE_MESSAGE : INVALID_ELEMENT_CODE_MESSAGE);
  const code = typeof value === 'string' ? value.trim() : '';
  if (!code) throw new Error('Kod elementu jest wymagany.');
  if (code.length > MAX_ELEMENT_CODE_LENGTH) throw new Error(`Kod elementu może mieć najwyżej ${MAX_ELEMENT_CODE_LENGTH} znaków.`);
  if (/[\p{C}]/u.test(code)) throw new Error('Kod elementu zawiera niedozwolone znaki.');
  return { code, parsed: null };
}
