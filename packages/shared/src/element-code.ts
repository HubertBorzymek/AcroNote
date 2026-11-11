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
    const saltoCount = Math.max(1, Math.floor(quarterCount / 4));
    const twistText = digits.slice(prefixLength);
    if (twistText.length !== saltoCount) continue;
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

export interface CheckedElementCode {
  code: string;
  /** Null when the user confirmed a code outside the notation. */
  parsed: ParsedElementCode | null;
}

/**
 * Accepts a code from the user. A code outside the notation is accepted only
 * when the user confirmed it (allowNonStandard); it is stored as typed and has
 * no derived fields.
 */
export function checkElementCode(value: unknown, allowNonStandard: boolean): CheckedElementCode {
  const parsed = parseElementCode(value);
  if (parsed) return { code: parsed.code, parsed };
  if (!allowNonStandard) throw new Error(INVALID_ELEMENT_CODE_MESSAGE);
  const code = typeof value === 'string' ? value.trim() : '';
  if (!code) throw new Error('Kod elementu jest wymagany.');
  if (code.length > MAX_ELEMENT_CODE_LENGTH) throw new Error(`Kod elementu może mieć najwyżej ${MAX_ELEMENT_CODE_LENGTH} znaków.`);
  if (/[\p{C}]/u.test(code)) throw new Error('Kod elementu zawiera niedozwolone znaki.');
  return { code, parsed: null };
}
