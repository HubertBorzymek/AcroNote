import { FormEvent, useState } from 'react';
import { api } from '../api';
import type { User } from '../types';

export const PASSWORD_MIN_LENGTH = 8;

export function Auth({ onAuthenticated }: { onAuthenticated: (user: User) => void }) {
  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);

  function switchMode(next: typeof mode) { setMode(next); setError(''); setInfo(''); }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (mode === 'register' && password !== confirmPassword) return setError('Hasła nie są takie same.');
    if (mode === 'register' && password.length < PASSWORD_MIN_LENGTH) return setError(`Hasło musi mieć co najmniej ${PASSWORD_MIN_LENGTH} znaków.`);
    setBusy(true); setError(''); setInfo('');
    try {
      if (mode === 'forgot') { setInfo((await api.requestPasswordReset(username, message)).message); setMessage(''); }
      else onAuthenticated(await (mode === 'login' ? api.login(username, password) : api.register(username, password)));
    }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Nie udało się połączyć z serwerem.'); }
    finally { setBusy(false); }
  }

  const heading = { login: ['Dobrze Cię widzieć', 'Zaloguj się, by wrócić do swoich treningów.'], register: ['Zacznij swój dziennik', 'Twoje elementy i treningi będą dostępne tylko dla Ciebie.'], forgot: ['Nie pamiętasz hasła?', 'Wyślij prośbę do administratora. Przekaże Ci jednorazowy kod, którym zalogujesz się i ustawisz nowe hasło.'] }[mode];
  return <main className="auth-page">
    <section className="auth-brand">
      <div className="logo-mark">A</div>
      <div><strong>AcroNote</strong><span>Twój trening. Twoja historia.</span></div>
    </section>
    <section className="auth-card">
      {mode !== 'forgot' && <div className="segmented">
        <button className={mode === 'login' ? 'active' : ''} onClick={() => switchMode('login')}>Logowanie</button>
        <button className={mode === 'register' ? 'active' : ''} onClick={() => switchMode('register')}>Nowe konto</button>
      </div>}
      <div className="auth-heading"><span className="kicker">Witaj w AcroNote</span><h1>{heading[0]}</h1><p>{heading[1]}</p></div>
      <form onSubmit={submit} className="form-stack">
        <label>Nazwa użytkownika<input autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required minLength={3} maxLength={80} placeholder="np. Maria Kowalska"/>{mode === 'register' && <small>Możesz wpisać imię i nazwisko ze spacją.</small>}</label>
        {mode === 'forgot'
          ? <label>Jak administrator może się z Tobą skontaktować? (opcjonalnie)<textarea value={message} onChange={(e) => setMessage(e.target.value)} maxLength={500} rows={3} placeholder="np. telefon, Messenger albo „spotkamy się na treningu”"/></label>
          : <label>Hasło<input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={(e) => setPassword(e.target.value)} required placeholder={mode === 'register' ? `Minimum ${PASSWORD_MIN_LENGTH} znaków` : 'Twoje hasło'}/>{mode === 'login' && <small>Masz kod od administratora? Wpisz go tutaj zamiast hasła.</small>}</label>}
        {mode === 'register' && <label>Powtórz hasło<input type="password" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required/></label>}
        {error && <p className="form-error" role="alert">{error}</p>}
        {info && <p className="hint" role="status">{info}</p>}
        <button className="button primary full" disabled={busy}>{busy ? 'Chwila…' : { login: 'Zaloguj się', register: 'Utwórz konto', forgot: 'Wyślij prośbę' }[mode]}</button>
        {mode === 'login' && <button type="button" className="text-button centered-link" onClick={() => switchMode('forgot')}>Zapomniałeś hasła?</button>}
        {mode === 'forgot' && <button type="button" className="text-button centered-link" onClick={() => switchMode('login')}>← Wróć do logowania</button>}
      </form>
    </section>
    <p className="auth-footnote">Lokalna i prywatna przestrzeń na Twój rozwój.</p>
  </main>;
}

/** Shown after logging in with a reset code: the only thing that session can do is set a new password. */
export function SetNewPassword({ user, onDone, onLogout }: { user: User; onDone: (user: User) => void; onLogout: () => void }) {
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (password.length < PASSWORD_MIN_LENGTH) return setError(`Hasło musi mieć co najmniej ${PASSWORD_MIN_LENGTH} znaków.`);
    if (password !== repeat) return setError('Hasła nie są takie same.');
    setBusy(true); setError('');
    try { onDone(await api.setNewPassword(password)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Nie udało się zapisać hasła.'); }
    finally { setBusy(false); }
  }
  return <main className="auth-page">
    <section className="auth-brand"><div className="logo-mark">A</div><div><strong>AcroNote</strong><span>Twój trening. Twoja historia.</span></div></section>
    <section className="auth-card">
      <div className="auth-heading"><span className="kicker">{user.username}</span><h1>Ustaw nowe hasło</h1><p>Zalogowałeś się kodem od administratora. Wpisz nowe hasło, którego będziesz od teraz używać.</p></div>
      <form onSubmit={submit} className="form-stack">
        <label>Nowe hasło<input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus placeholder={`Minimum ${PASSWORD_MIN_LENGTH} znaków`}/></label>
        <label>Powtórz nowe hasło<input type="password" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} required/></label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="button primary full" disabled={busy}>{busy ? 'Zapisywanie…' : 'Zapisz i przejdź do aplikacji'}</button>
        <button type="button" className="text-button centered-link" onClick={onLogout}>Anuluj i wyloguj</button>
      </form>
    </section>
  </main>;
}
