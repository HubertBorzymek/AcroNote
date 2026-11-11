import { describe, expect, it } from 'vitest';
import { formatTime, formatTimeDelta, parseSeconds } from './time';

describe('czas wykonania', () => {
  it('przyjmuje przecinek lub kropkę i najwyżej tysięczne sekundy', () => {
    expect(parseSeconds('1,234')).toBe(1234);
    expect(parseSeconds('1.234')).toBe(1234);
    expect(parseSeconds(' 2 ')).toBe(2000);
    expect(parseSeconds('0,5 s')).toBe(500);
    expect(parseSeconds('1,')).toBe(1000);
    expect(parseSeconds('')).toBeNull();
    for (const bad of ['1,2345', 'abc', '-1', '0', '601', '1,2,3']) expect(parseSeconds(bad)).toBeUndefined();
  });
  it('pokazuje czas po polsku bez zbędnych zer', () => {
    expect(formatTime(1234)).toBe('1,234 s');
    expect(formatTime(1200)).toBe('1,2 s');
    expect(formatTime(1000)).toBe('1,0 s');
    expect(formatTime(75500)).toBe('75,5 s');
    expect(formatTimeDelta(41)).toBe('+0,041 s');
    expect(formatTimeDelta(-120)).toBe('−0,12 s');
  });
});
