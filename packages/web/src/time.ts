// Times of a single execution are kept as whole milliseconds and typed as seconds with up to three decimals.
export const MAX_TIME_MS = 600_000;

/** "1,234" / "1.234" / "1" → 1234 ms; empty → null; anything else → undefined (invalid). */
export function parseSeconds(text: string): number | null | undefined {
  const clean = text.trim().replace(/\s|s$/gi, '').replace(',', '.');
  if (!clean) return null;
  if (!/^\d{1,3}(\.\d{0,3})?$/.test(clean)) return undefined;
  const ms = Math.round(Number(clean) * 1000);
  return ms >= 1 && ms <= MAX_TIME_MS ? ms : undefined;
}

const secondsFormat = new Intl.NumberFormat('pl-PL', { minimumFractionDigits: 1, maximumFractionDigits: 3, useGrouping: false });

/** 1234 → "1,234"; 1200 → "1,2"; 1000 → "1,0" (without the unit). */
export const formatSeconds = (ms: number) => secondsFormat.format(ms / 1000);
export const formatTime = (ms: number) => `${formatSeconds(ms)} s`;

/** Signed difference, e.g. "+0,041 s" or "−0,120 s". */
export function formatTimeDelta(ms: number) {
  if (ms === 0) return '±0,0 s';
  return `${ms > 0 ? '+' : '−'}${formatSeconds(Math.abs(ms))} s`;
}
