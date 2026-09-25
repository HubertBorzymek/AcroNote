export type BodyPosition = 'o' | '<' | '/';

export interface ParsedElementCode {
  quarterTurns: number;
  somersaults: number;
  totalTwists: number;
  direction: 'Przód' | 'Tył';
  position: BodyPosition;
  positionName: 'Kuczna' | 'Łamana' | 'Prosta';
}

const positionNames: Record<BodyPosition, ParsedElementCode['positionName']> = { o: 'Kuczna', '<': 'Łamana', '/': 'Prosta' };

/** Interpretuje kod FIG używany w aplikacji, np. 41o, 831<, 12001/. */
export function parseElementCode(value: string): ParsedElementCode | null {
  const code = value.trim();
  const position = code.at(-1) as BodyPosition;
  if (!['o', '<', '/'].includes(position)) return null;
  const digits = code.slice(0, -1);
  if (!/^\d+$/.test(digits)) return null;
  const matches: ParsedElementCode[] = [];
  for (const prefixLength of [1, 2]) {
    if (digits.length <= prefixLength) continue;
    const quarterTurns = Number(digits.slice(0, prefixLength));
    if (quarterTurns < 1 || quarterTurns > 12) continue;
    const somersaults = Math.max(1, Math.floor(quarterTurns / 4));
    const twists = digits.slice(prefixLength);
    if (twists.length !== somersaults) continue;
    const totalTwists = [...twists].reduce((sum, digit) => sum + Number(digit) / 2, 0);
    matches.push({ quarterTurns, somersaults, totalTwists, direction: Number.isInteger(totalTwists) ? 'Tył' : 'Przód', position, positionName: positionNames[position] });
  }
  return matches.length === 1 ? matches[0] : null;
}

export function formatTwists(value: number) {
  return Number.isInteger(value) ? String(value) : value.toLocaleString('pl-PL', { maximumFractionDigits: 1 });
}
