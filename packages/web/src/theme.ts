export type Theme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'acronote-theme';

export function resolveTheme(saved: string | null, prefersDark = false): Theme {
  if (saved === 'light' || saved === 'dark') return saved;
  return prefersDark ? 'dark' : 'light';
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#101a15' : '#f4f6f2');
}
