import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// iOS draws characters that have an emoji form (e.g. ↗ or ☀) as a coloured emoji tile, ignoring CSS colour
// and opacity. A user on an iPhone saw a large blue arrow in the middle of the start screen because of this.
// Decorative symbols must be SVG icons instead.
const root = fileURLToPath(new URL('.', import.meta.url));
const files = (dir: string): string[] => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name);
  return statSync(path).isDirectory() ? files(path) : /\.(tsx|css)$/.test(name) ? [path] : [];
});
const emojiCapable = /(?![0-9#*©®])\p{Emoji}/u;

describe('symbole w interfejsie', () => {
  it('nie używa znaków, które iOS pokazuje jako emoji', () => {
    const found = files(root).flatMap((path) => readFileSync(path, 'utf8').split('\n').flatMap((line, index) => {
      const match = line.match(emojiCapable);
      return match ? [`${path.slice(root.length)}:${index + 1} „${match[0]}” (U+${match[0].codePointAt(0)!.toString(16).toUpperCase()})`] : [];
    }));
    expect(found).toEqual([]);
  });
});
