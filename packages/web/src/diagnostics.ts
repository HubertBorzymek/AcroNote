// In-memory flight recorder attached to bug reports: recent API calls, errors and screens.
// It never stores request/response bodies, query strings or invitation tokens.

type RequestRecord = { at: string; method: string; path: string; status: number | 'network-error'; ms: number; message?: string };
type ErrorRecord = { at: string; source: 'error' | 'unhandledrejection' | 'console' | 'render'; message: string; stack?: string };
type NavigationRecord = { at: string; path: string };

const LIMITS = { requests: 40, errors: 25, navigation: 25 };
const requests: RequestRecord[] = [];
const errors: ErrorRecord[] = [];
const navigation: NavigationRecord[] = [];
const startedAt = new Date().toISOString();

const now = () => new Date().toISOString();
const push = <T>(list: T[], item: T, limit: number) => { list.push(item); if (list.length > limit) list.splice(0, list.length - limit); };
const clip = (value: unknown, max: number) => String(value ?? '').slice(0, max);

/** Removes query strings and secrets that can appear in paths (invitation tokens). */
export function sanitizePath(path: string): string {
  return path.split(/[?#]/)[0]!.replace(/\/(zaproszenie|connect)\/[^/]+/g, '/$1/[ukryte]');
}

export function recordRequest(method: string, path: string, status: RequestRecord['status'], ms: number, message?: string) {
  push(requests, { at: now(), method, path: sanitizePath(path), status, ms: Math.round(ms), ...(message ? { message: clip(message, 300) } : {}) }, LIMITS.requests);
}

export function recordError(source: ErrorRecord['source'], error: unknown) {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : JSON.stringify(error);
  const stack = error instanceof Error ? error.stack : undefined;
  push(errors, { at: now(), source, message: clip(message, 500), ...(stack ? { stack: clip(stack, 2000) } : {}) }, LIMITS.errors);
}

export function recordNavigation(path: string) {
  const clean = sanitizePath(path);
  if (navigation.at(-1)?.path === clean) return;
  push(navigation, { at: now(), path: clean }, LIMITS.navigation);
}

let installed = false;
export function installDiagnostics() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener('error', (event) => recordError('error', event.error ?? event.message));
  window.addEventListener('unhandledrejection', (event) => recordError('unhandledrejection', event.reason));
  const original = console.error.bind(console);
  console.error = (...args: unknown[]) => { recordError('console', args.map((arg) => arg instanceof Error ? arg.message : String(arg)).join(' ')); original(...args); };
  recordNavigation(location.pathname);
}

const readStorage = (key: string) => { try { return globalThis.localStorage?.getItem(key) ?? null; } catch { return null; } };

/** The client-side state snapshot sent with a report. Tolerates missing browser globals (tests, crashes). */
export function collectDiagnostics() {
  const g = globalThis as any;
  return {
    appVersion: __APP_VERSION__,
    collectedAt: now(),
    sessionStartedAt: startedAt,
    page: sanitizePath(g.location?.pathname ?? '/'),
    browser: {
      userAgent: g.navigator?.userAgent ?? null, language: g.navigator?.language ?? null, online: g.navigator?.onLine ?? null,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      viewport: g.innerWidth ? `${g.innerWidth}x${g.innerHeight}` : null, screen: g.screen ? `${g.screen.width}x${g.screen.height}` : null, pixelRatio: g.devicePixelRatio ?? null,
    },
    preferences: { theme: g.document?.documentElement?.dataset?.theme ?? null, profile: readStorage('acronote-profile') },
    navigation: [...navigation],
    requests: [...requests],
    errors: [...errors],
  };
}

export type Diagnostics = ReturnType<typeof collectDiagnostics>;
