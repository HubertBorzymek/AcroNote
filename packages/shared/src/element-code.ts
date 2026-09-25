export type ElementDirection = 'front' | 'back';
export type ElementPosition = 'tuck' | 'pike' | 'straight';

export interface ParsedElementCode {
  code: string;
  quarterCount: number;
  saltoCount: number;
  twistDigits: number[];
  totalTwistHalves: number;
  totalTwists: number;
  direction: ElementDirection;
  position: ElementPosition;
  positionSymbol: 'o' | '<' | '/';
}

const positions: Record<string, ElementPosition> = { o: 'tuck', '<': 'pike', '/': 'straight' };

/** Parses the complete AcroNote notation. It deliberately accepts no shorthand. */
export function parseElementCode(value: unknown): ParsedElementCode | null {
  if (typeof value !== 'string') return null;
  const code = value.trim();
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

export function validateElementCode(value: unknown): ParsedElementCode {
  const parsed = parseElementCode(value);
  if (!parsed) throw new Error('Kod elementu jest nieprawidłowy. Użyj pełnego kodu zakończonego znakiem o, < lub /.');
  return parsed;
}
