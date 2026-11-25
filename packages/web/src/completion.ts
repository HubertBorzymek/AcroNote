/** Positive wording only: what worked out, never what failed. */
export function completedText(total: number, unfinished: number): string | null {
  if (!total || !unfinished) return null;
  return `ukończone ${total - unfinished} z ${total}`;
}

export function percent(part: number, total: number): number {
  return total ? Math.round(part / total * 100) : 0;
}

/** "udane 12 z 13 (92%)" for an element; null when nothing was recorded. */
export function successText(count: number, failed: number): string | null {
  if (!count) return null;
  const done = count - failed;
  return `udane ${done} z ${count} (${percent(done, count)}%)`;
}

/** Elements that work out most reliably: at least `minAttempts` executions, best rate first, then more attempts. */
export function mostReliable<T extends { count: number; failed: number }>(items: T[], minAttempts = 3, limit = 5): T[] {
  return items.filter((item) => item.count >= minAttempts)
    .sort((a, b) => (b.count - b.failed) / b.count - (a.count - a.failed) / a.count || b.count - a.count)
    .slice(0, limit);
}
