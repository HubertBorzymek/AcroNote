import { FormEvent, useState } from 'react';
import { api } from '../api';
import type { User } from '../types';
import { PageHeader, Toast } from '../components/ui';

export function ProfilePage({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [showPassword, setShowPassword] = useState(false);
  const [current, setCurrent] = useState(''); const [next, setNext] = useState(''); const [repeat, setRepeat] = useState('');
  const [message, setMessage] = useState(''); const [error, setError] = useState(false);
  async function changePassword(event: FormEvent) {
    event.preventDefault();
    if (next.length < 8) { setError(true); return setMessage('Nowe hasło musi mieć co najmniej 8 znaków.'); }
    if (next !== repeat) { setError(true); return setMessage('Nowe hasła nie są takie same.'); }
    try { await api.changePassword(current, next); setCurrent(''); setNext(''); setRepeat(''); setShowPassword(false); setError(false); setMessage('Hasło zostało zmienione.'); }
    catch (reason) { setError(true); setMessage(reason instanceof Error ? reason.message : 'Nie udało się zmienić hasła.'); }
  }
  return <div className="page"><PageHeader title="Profil i ustawienia" eyebrow="Twoje konto"/>
    <section className="profile-hero"><div className="avatar">{user.username.slice(0, 1).toUpperCase()}</div><div><h2>{user.username}</h2><span>Konto AcroNote</span></div></section>
    <section className="settings-card"><h2>Aktywne profile</h2><div className="profile-option active"><span>↗</span><div><strong>Zawodnik</strong><small>Dziennik treningów, elementy i statystyki</small></div><b>Aktywny</b></div><div className="profile-option"><span>◎</span><div><strong>Trener</strong><small>Podgląd połączonych zawodników</small></div><b>Wkrótce</b></div></section>
    <section className="settings-card"><h2>Bezpieczeństwo</h2>{!showPassword ? <button className="settings-row" onClick={() => setShowPassword(true)}><span>◇</span><div><strong>Zmień hasło</strong><small>Zaktualizuj hasło do swojego konta</small></div><i>›</i></button> : <form className="form-stack inset" onSubmit={changePassword}><label>Obecne hasło<input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} required autoComplete="current-password"/></label><label>Nowe hasło<input type="password" value={next} onChange={(e) => setNext(e.target.value)} required autoComplete="new-password"/></label><label>Powtórz nowe hasło<input type="password" value={repeat} onChange={(e) => setRepeat(e.target.value)} required autoComplete="new-password"/></label><div className="sheet-actions"><button className="button secondary" type="button" onClick={() => setShowPassword(false)}>Anuluj</button><button className="button primary">Zmień hasło</button></div></form>}</section>
    <section className="settings-card"><h2>Rodzaje wykonania</h2><p className="settings-copy">Na płasko, Materac i Gąbki są dostępne domyślnie. Własnymi rodzajami wykonania zarządzasz w tej sekcji po stronie API.</p></section>
    <button className="logout-button" onClick={() => void onLogout()}>Wyloguj się</button>
    <p className="version">AcroNote · wersja 0.1.0</p>
    {message && <Toast message={message} kind={error ? 'error' : 'success'} onClose={() => setMessage('')}/>} 
  </div>;
}
