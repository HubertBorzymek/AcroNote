import { FormEvent, useState } from 'react';
import { api } from '../api';
import type { User } from '../types';

export function Auth({ onAuthenticated }: { onAuthenticated: (user: User) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (mode === 'register' && password !== confirmPassword) return setError('Hasła nie są takie same.');
    if (password.length < 8) return setError('Hasło musi mieć co najmniej 8 znaków.');
    setBusy(true); setError('');
    try { onAuthenticated(await (mode === 'login' ? api.login(username, password) : api.register(username, password))); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Nie udało się połączyć z serwerem.'); }
    finally { setBusy(false); }
  }

  return <main className="auth-page">
    <section className="auth-brand">
      <div className="logo-mark">A</div>
      <div><strong>AcroNote</strong><span>Twój trening. Twoja historia.</span></div>
    </section>
    <section className="auth-card">
      <div className="segmented">
        <button className={mode === 'login' ? 'active' : ''} onClick={() => { setMode('login'); setError(''); }}>Logowanie</button>
        <button className={mode === 'register' ? 'active' : ''} onClick={() => { setMode('register'); setError(''); }}>Nowe konto</button>
      </div>
      <div className="auth-heading"><span className="kicker">Witaj w AcroNote</span><h1>{mode === 'login' ? 'Dobrze Cię widzieć' : 'Zacznij swój dziennik'}</h1><p>{mode === 'login' ? 'Zaloguj się, by wrócić do swoich treningów.' : 'Twoje elementy i treningi będą dostępne tylko dla Ciebie.'}</p></div>
      <form onSubmit={submit} className="form-stack">
        <label>Nazwa użytkownika<input autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required minLength={3} maxLength={80} placeholder="np. Maria Kowalska"/><small>Możesz wpisać imię i nazwisko ze spacją.</small></label>
        <label>Hasło<input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="Minimum 8 znaków"/></label>
        {mode === 'register' && <label>Powtórz hasło<input type="password" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required/></label>}
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="button primary full" disabled={busy}>{busy ? 'Chwila…' : mode === 'login' ? 'Zaloguj się' : 'Utwórz konto'}</button>
      </form>
    </section>
    <p className="auth-footnote">Lokalna i prywatna przestrzeń na Twój rozwój.</p>
  </main>;
}
