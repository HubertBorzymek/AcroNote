import { FormEvent, useState } from 'react';
import { api } from '../api';
import type { User } from '../types';
import { PageHeader, Toast } from '../components/ui';
import { useAsync } from '../hooks';

export function ProfilePage({ user, onLogout }: { user: User; onLogout: () => void }) {
  const executionTypes = useAsync(api.executionTypes, []);
  const [showPassword, setShowPassword] = useState(false);
  const [current, setCurrent] = useState(''); const [next, setNext] = useState(''); const [repeat, setRepeat] = useState('');
  const [message, setMessage] = useState(''); const [error, setError] = useState(false);
  async function changePassword(event: FormEvent) {
    event.preventDefault();
    if (next.length < 10) { setError(true); return setMessage('Nowe hasło musi mieć co najmniej 10 znaków.'); }
    if (next !== repeat) { setError(true); return setMessage('Nowe hasła nie są takie same.'); }
    try { await api.changePassword(current, next); setCurrent(''); setNext(''); setRepeat(''); setShowPassword(false); setError(false); setMessage('Hasło zostało zmienione.'); }
    catch (reason) { setError(true); setMessage(reason instanceof Error ? reason.message : 'Nie udało się zmienić hasła.'); }
  }
  async function updateType(id: string, change: 'rename' | 'hide' | 'up' | 'down') {
    const items = executionTypes.data ?? []; const index = items.findIndex((item) => item.id === id); const item = items[index]; if (!item) return;
    try {
      if (change === 'rename') { const name = prompt('Nowa nazwa rodzaju wykonania:', item.name); if (!name?.trim()) return; await api.updateExecutionType({ ...item, name: name.trim() }); }
      else if (change === 'hide') await api.updateExecutionType({ ...item, hidden: !item.hidden });
      else { const otherIndex = index + (change === 'up' ? -1 : 1); const other = items[otherIndex]; if (!other) return; await Promise.all([api.updateExecutionType({ ...item, sortOrder: other.sortOrder ?? otherIndex }), api.updateExecutionType({ ...other, sortOrder: item.sortOrder ?? index })]); }
      await executionTypes.reload(); setError(false); setMessage('Rodzaje wykonania zostały zapisane.');
    } catch (reason) { setError(true); setMessage(reason instanceof Error ? reason.message : 'Nie udało się zapisać zmiany.'); }
  }
  async function addType() { const name = prompt('Nazwa nowego rodzaju wykonania:'); if (!name?.trim()) return; try { await api.createExecutionType(name.trim()); await executionTypes.reload(); setMessage('Dodano rodzaj wykonania.'); setError(false); } catch (reason) { setError(true); setMessage(reason instanceof Error ? reason.message : 'Nie udało się dodać rodzaju.'); } }
  return <div className="page"><PageHeader title="Profil i ustawienia" eyebrow="Twoje konto"/>
    <section className="profile-hero"><div className="avatar">{user.username.slice(0, 1).toUpperCase()}</div><div><h2>{user.username}</h2><span>Konto AcroNote</span></div></section>
    <section className="settings-card"><h2>Aktywne profile</h2><div className="profile-option active"><span>↗</span><div><strong>Zawodnik</strong><small>Dziennik treningów, elementy i statystyki</small></div><b>Aktywny</b></div><div className="profile-option"><span>◎</span><div><strong>Trener</strong><small>Podgląd połączonych zawodników</small></div><b>Wkrótce</b></div></section>
    <section className="settings-card"><h2>Bezpieczeństwo</h2>{!showPassword ? <button className="settings-row" onClick={() => setShowPassword(true)}><span>◇</span><div><strong>Zmień hasło</strong><small>Zaktualizuj hasło do swojego konta</small></div><i>›</i></button> : <form className="form-stack inset" onSubmit={changePassword}><label>Obecne hasło<input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} required autoComplete="current-password"/></label><label>Nowe hasło<input type="password" minLength={10} value={next} onChange={(e) => setNext(e.target.value)} required autoComplete="new-password"/></label><label>Powtórz nowe hasło<input type="password" minLength={10} value={repeat} onChange={(e) => setRepeat(e.target.value)} required autoComplete="new-password"/></label><div className="sheet-actions"><button className="button secondary" type="button" onClick={() => setShowPassword(false)}>Anuluj</button><button className="button primary">Zmień hasło</button></div></form>}</section>
    <section className="settings-card"><div className="settings-heading"><h2>Rodzaje wykonania</h2><button onClick={() => void addType()}>+ Dodaj</button></div><p className="settings-copy">Ustaw nazwy i kolejność widoczną podczas zapisywania treningu.</p><div className="execution-settings">{executionTypes.data?.map((item, index) => <div key={item.id} className={item.hidden ? 'hidden' : ''}><strong>{item.name === 'Na płasko' ? 'Siatka' : item.name}</strong><span>{item.hidden ? 'Ukryty' : 'Widoczny'}</span><button disabled={index === 0} aria-label="Wyżej" onClick={() => void updateType(item.id, 'up')}>↑</button><button disabled={index === executionTypes.data!.length - 1} aria-label="Niżej" onClick={() => void updateType(item.id, 'down')}>↓</button><button onClick={() => void updateType(item.id, 'rename')}>Zmień nazwę</button><button onClick={() => void updateType(item.id, 'hide')}>{item.hidden ? 'Przywróć' : 'Ukryj'}</button></div>)}</div></section>
    <button className="logout-button" onClick={() => void onLogout()}>Wyloguj się</button>
    <p className="version">AcroNote · wersja 0.1.0</p>
    {message && <Toast message={message} kind={error ? 'error' : 'success'} onClose={() => setMessage('')}/>} 
  </div>;
}
