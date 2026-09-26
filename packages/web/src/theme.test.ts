import { describe, expect, it } from 'vitest';
import { resolveTheme } from './theme';

describe('motyw aplikacji', () => {
  it('zachowuje świadomy wybór użytkownika', () => {
    expect(resolveTheme('dark', false)).toBe('dark');
    expect(resolveTheme('light', true)).toBe('light');
  });

  it('przy pierwszym uruchomieniu respektuje ustawienie urządzenia', () => {
    expect(resolveTheme(null, true)).toBe('dark');
    expect(resolveTheme(null, false)).toBe('light');
    expect(resolveTheme('nieznany', true)).toBe('dark');
  });
});
