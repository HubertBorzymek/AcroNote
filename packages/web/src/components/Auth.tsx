import { FormEvent, type ReactNode, useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import type { OwnPasswordReset, User } from '../types';

export const PASSWORD_MIN_LENGTH = 8;

const errorText = (reason: unknown, fallback: string) => reason instanceof Error ? reason.message : fallback;

function AuthLayout({ children }: { children: ReactNode }) {
  return <main className="auth-page">
    <section className="auth-brand"><div className="logo-mark">A</div><div><strong>AcroNote</strong><span>Twój trening. Twoja historia.</span></div></section>
    <section className="auth-card">{children}</section>
    <p className="auth-footnote">Lokalna i prywatna przestrzeń na Twój rozwój.</p>
  </main>;
}

export function Auth({ onAuthenticated }: { onAuthenticated: (user: User) => void }) {
  const [mode, setMode] = useState<'login' | 'register' | 'forgot' | 'reset'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [reset, setReset] = useState<OwnPasswordReset>({ status: 'none' });

  // The request lives in an HttpOnly cookie of this browser, so the screen asks the server for its state.
  const checkReset = useCallback(async (open = false) => {
    try { const state = await api.ownPasswordReset(); setReset(state); if (open && state.status !== 'none') setMode('reset'); }
    catch { /* offline: the login form still works */ }
  }, []);
  useEffect(() => { void checkReset(true); }, [checkReset]);
  useEffect(() => {
    if (reset.status !== 'pending') return;
    const refresh = () => { if (document.visibilityState === 'visible') void checkReset(); };
    const timer = setInterval(refresh, 30_000);
    addEventListener('focus', refresh); document.addEventListener('visibilitychange', refresh);
    return () => { clearInterval(timer); removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, [reset.status, checkReset]);

  function switchMode(next: typeof mode) { setMode(next); setError(''); }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (mode === 'register' && password !== confirmPassword) return setError('Hasła nie są takie same.');
    if (mode === 'register' && password.length < PASSWORD_MIN_LENGTH) return setError(`Hasło musi mieć co najmniej ${PASSWORD_MIN_LENGTH} znaków.`);
    setBusy(true); setError('');
    try {
      if (mode === 'forgot') { setReset(await api.requestPasswordReset(username, message)); setMessage(''); setMode('reset'); }
      else onAuthenticated(await (mode === 'login' ? api.login(username, password) : api.register(username, password)));
    }
    catch (reason) { setError(errorText(reason, 'Nie udało się połączyć z serwerem.')); }
    finally { setBusy(false); }
  }

  if (mode === 'reset') return <AuthLayout><ResetStatus state={reset} onRefresh={() => checkReset()} onAuthenticated={onAuthenticated}
    onNewRequest={async () => { await api.cancelPasswordReset().catch(() => undefined); setReset({ status: 'none' }); switchMode('forgot'); }}
    onBack={() => switchMode('login')}/></AuthLayout>;

  const heading = { login: ['Dobrze Cię widzieć', 'Zaloguj się, by wrócić do swoich treningów.'], register: ['Zacznij swój dziennik', 'Twoje elementy i treningi będą dostępne tylko dla Ciebie.'], forgot: ['Nie pamiętasz hasła?', 'Wyślij prośbę do administratora. Gdy ją zatwierdzi, ustawisz nowe hasło na tym urządzeniu.'] }[mode];
  return <AuthLayout>
    {mode !== 'forgot' && <div className="segmented">
      <button className={mode === 'login' ? 'active' : ''} onClick={() => switchMode('login')}>Logowanie</button>
      <button className={mode === 'register' ? 'active' : ''} onClick={() => switchMode('register')}>Nowe konto</button>
    </div>}
    <div className="auth-heading"><span className="kicker">Witaj w AcroNote</span><h1>{heading[0]}</h1><p>{heading[1]}</p></div>
    {(reset.status === 'pending' || reset.status === 'approved') && mode === 'login' && <button className="reset-banner" onClick={() => switchMode('reset')}>{reset.status === 'approved' ? 'Administrator zatwierdził reset hasła. Ustaw nowe hasło' : `Prośba o reset hasła nr ${reset.requestNumber} czeka na administratora`} ›</button>}
    <form onSubmit={submit} className="form-stack">
      <label>Nazwa użytkownika<input autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required minLength={3} maxLength={80} placeholder="np. Maria Kowalska"/>{mode === 'register' && <small>Możesz wpisać imię i nazwisko ze spacją.</small>}</label>
      {mode === 'forgot'
        ? <label>Wiadomość dla administratora <span className="optional">opcjonalnie</span><textarea value={message} onChange={(e) => setMessage(e.target.value)} maxLength={500} rows={3} placeholder="np. jak się z Tobą skontaktować"/></label>
        : <label>Hasło<input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={(e) => setPassword(e.target.value)} required placeholder={mode === 'register' ? `Minimum ${PASSWORD_MIN_LENGTH} znaków` : 'Twoje hasło'}/></label>}
      {mode === 'register' && <label>Powtórz hasło<input type="password" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required/></label>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="button primary full" disabled={busy}>{busy ? 'Chwila…' : { login: 'Zaloguj się', register: 'Utwórz konto', forgot: 'Wyślij prośbę' }[mode]}</button>
      {mode === 'login' && <button type="button" className="text-button centered-link" onClick={() => switchMode('forgot')}>Zapomniałeś hasła?</button>}
      {mode === 'forgot' && <button type="button" className="text-button centered-link" onClick={() => switchMode('login')}>← Wróć do logowania</button>}
    </form>
  </AuthLayout>;
}

function ResetStatus({ state, onRefresh, onAuthenticated, onNewRequest, onBack }: { state: OwnPasswordReset; onRefresh: () => Promise<void>; onAuthenticated: (user: User) => void; onNewRequest: () => Promise<void>; onBack: () => void }) {
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function run(action: () => Promise<void>) { setBusy(true); setError(''); try { await action(); } catch (reason) { setError(errorText(reason, 'Nie udało się połączyć z serwerem.')); } finally { setBusy(false); } }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (password.length < PASSWORD_MIN_LENGTH) return setError(`Hasło musi mieć co najmniej ${PASSWORD_MIN_LENGTH} znaków.`);
    if (password !== repeat) return setError('Hasła nie są takie same.');
    await run(async () => onAuthenticated(await api.completePasswordReset(password)));
  }
  if (state.status === 'approved') return <>
    <div className="auth-heading"><span className="kicker">{state.username}</span><h1>Ustaw nowe hasło</h1><p>Administrator zatwierdził Twoją prośbę nr {state.requestNumber}. Wpisz nowe hasło, którego będziesz od teraz używać.</p></div>
    <form onSubmit={submit} className="form-stack">
      <label>Nowe hasło<input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus placeholder={`Minimum ${PASSWORD_MIN_LENGTH} znaków`}/></label>
      <label>Powtórz nowe hasło<input type="password" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} required/></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="button primary full" disabled={busy}>{busy ? 'Zapisywanie…' : 'Zapisz i zaloguj się'}</button>
      <button type="button" className="text-button centered-link" onClick={onBack}>← Wróć do logowania</button>
    </form>
  </>;
  if (state.status === 'pending') return <>
    <div className="auth-heading"><span className="kicker">Prośba o reset hasła</span><h1>Czekamy na administratora</h1><p>Konto: <strong>{state.username}</strong></p></div>
    <div className="request-number" aria-label={`Numer prośby ${state.requestNumber}`}><span>Numer prośby</span><strong>{state.requestNumber}</strong></div>
    <p className="hint">Daj znać administratorowi, że wysłałeś prośbę, i podaj ten numer. Gdy ją zatwierdzi, ustawisz tutaj nowe hasło. Zrób to na tym samym urządzeniu i w tej samej przeglądarce.</p>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="form-stack">
      <button className="button primary full" disabled={busy} onClick={() => void run(onRefresh)}>{busy ? 'Sprawdzam…' : 'Sprawdź, czy zatwierdził'}</button>
      <button type="button" className="text-button centered-link" onClick={() => confirm('Anulować prośbę o reset hasła?') && void run(onNewRequest)}>Anuluj prośbę</button>
      <button type="button" className="text-button centered-link" onClick={onBack}>← Wróć do logowania</button>
    </div>
  </>;
  const ended = { rejected: 'Administrator odrzucił tę prośbę.', expired: 'Prośba wygasła.', done: 'Hasło zostało już zmienione.', cancelled: 'Prośba została anulowana.', none: 'Brak prośby na tym urządzeniu.' }[state.status];
  return <>
    <div className="auth-heading"><span className="kicker">Prośba o reset hasła{state.requestNumber ? ` nr ${state.requestNumber}` : ''}</span><h1>{ended}</h1><p>Jeśli nadal potrzebujesz pomocy, wyślij nową prośbę.</p></div>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="form-stack">
      <button className="button primary full" disabled={busy} onClick={() => void run(onNewRequest)}>Wyślij nową prośbę</button>
      <button type="button" className="text-button centered-link" onClick={onBack}>← Wróć do logowania</button>
    </div>
  </>;
}

/** Second login step for administrators: a code from the authenticator app, or a one-time recovery code. */
export function TwoStepPrompt({ user, onDone, onLogout }: { user: User; onDone: (user: User) => void; onLogout: () => void }) {
  const [code, setCode] = useState('');
  const [recovery, setRecovery] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try { onDone(await api.verifyTwoStep(code)); }
    catch (reason) {
      const text = errorText(reason, 'Nie udało się sprawdzić kodu.');
      if (text.includes('Zaloguj się ponownie')) { alert(text); onLogout(); return; }
      setError(text); setCode('');
    }
    finally { setBusy(false); }
  }
  return <AuthLayout>
    <div className="auth-heading"><span className="kicker">{user.username}</span><h1>Weryfikacja dwuetapowa</h1><p>{recovery ? 'Wpisz jeden z kodów zapasowych (np. ABCD-EFGH). Każdy działa tylko raz.' : 'Otwórz aplikację uwierzytelniającą na telefonie i wpisz aktualny 6-cyfrowy kod AcroNote.'}</p></div>
    <form onSubmit={submit} className="form-stack">
      <label>{recovery ? 'Kod zapasowy' : 'Kod z aplikacji'}<input key={recovery ? 'recovery' : 'totp'} autoFocus required value={code} onChange={(e) => setCode(e.target.value)} {...(recovery ? { autoCapitalize: 'characters', placeholder: 'ABCD-EFGH', maxLength: 12 } : { inputMode: 'numeric' as const, autoComplete: 'one-time-code', pattern: '[0-9 ]*', placeholder: '123456', maxLength: 7 })}/></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="button primary full" disabled={busy}>{busy ? 'Sprawdzam…' : 'Potwierdź'}</button>
      <button type="button" className="text-button centered-link" onClick={() => { setRecovery(!recovery); setCode(''); setError(''); }}>{recovery ? 'Użyj kodu z aplikacji' : 'Nie mam telefonu: użyj kodu zapasowego'}</button>
      <button type="button" className="text-button centered-link" onClick={onLogout}>Anuluj i wyloguj</button>
    </form>
  </AuthLayout>;
}
