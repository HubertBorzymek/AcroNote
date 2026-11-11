export type BodyPosition = 'o' | '<' | '/';

export interface ParsedElementCode {
  quarterTurns: number;
  somersaults: number;
  totalTwists: number;
  /** Null for a jump without a somersault (o, <, /). */
  direction: 'Przód' | 'Tył' | null;
  position: BodyPosition;
  positionName: 'Kuczna' | 'Łamana' | 'Prosta';
}

const positionNames: Record<BodyPosition, ParsedElementCode['positionName']> = { o: 'Kuczna', '<': 'Łamana', '/': 'Prosta' };

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
    const somersaults = Math.max(1, Math.floor(quarterTurns / 4));
    const twists = digits.slice(prefixLength);
    if (twists.length !== somersaults) continue;
    const totalTwists = [...twists].reduce((sum, digit) => sum + Number(digit) / 2, 0);
    matches.push({ quarterTurns, somersaults, totalTwists, direction: Number.isInteger(totalTwists) ? 'Tył' : 'Przód', position, positionName: positionNames[position] });
  }
  return matches.length === 1 ? matches[0] : null;
}

const jumpNames: Record<BodyPosition, string> = { o: 'Kuczka', '<': 'Rozkroczka', '/': 'Poziomka' };

/** Nazwa zwyczajowa elementu bez salta (o, <, /), pokazywana, gdy użytkownik nie nadał własnej. Nie jest zapisywana. */
export function standardElementName(code: string): string | null {
  const parsed = parseElementCode(code);
  return parsed && parsed.somersaults === 0 ? jumpNames[parsed.position] : null;
}

function isPosition(value: string | undefined): value is BodyPosition {
  return value === 'o' || value === '<' || value === '/';
}

/** Krótki opis kodu pod polem formularza; null dla kodu spoza notacji. */
export function describeElementCode(value: string): string | null {
  const code = parseElementCode(value);
  if (!code) return null;
  if (code.somersaults === 0) return `${standardElementName(value)} · element bez salta`;
  return `${code.somersaults} ${code.somersaults === 1 ? 'salto' : 'salta'} · ${formatTwists(code.totalTwists)} śruby · ${code.direction!.toLowerCase()} · ${code.positionName.toLowerCase()}`;
}

export function formatTwists(value: number) {
  return Number.isInteger(value) ? String(value) : value.toLocaleString('pl-PL', { maximumFractionDigits: 1 });
}
