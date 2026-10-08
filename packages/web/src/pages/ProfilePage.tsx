import { FormEvent, useEffect, useState } from 'react';
import { api } from '../api';
import type { User } from '../types';
import { PageHeader, Toast } from '../components/ui';
import { useAsync } from '../hooks';
import { InvitationPanel } from '../components/Connections';
import { openBugReport, SENT_EVENT } from '../components/BugReport';
import type { Theme } from '../theme';

export function ProfilePage({ user, onLogout, onUserChange, theme, onThemeChange, invitation = '', pendingCoachInvitation = '' }: { user: User; onLogout: () => void; onUserChange: (user: User) => void; theme: Theme; onThemeChange: (theme: Theme) => void; invitation?: string; pendingCoachInvitation?: string }) {
  const executionTypes = useAsync(api.executionTypes, []);
  const [showPassword, setShowPassword] = useState(false);
  const [current, setCurrent] = useState(''); const [next, setNext] = useState(''); const [repeat, setRepeat] = useState('');
  const [message, setMessage] = useState(''); const [error, setError] = useState(false);
  const coaches = useAsync(api.athleteCoaches, []);
  const reports = useAsync(api.myBugReports, []);
  useEffect(() => { const reload = () => void reports.reload(); addEventListener(SENT_EVENT, reload); return () => removeEventListener(SENT_EVENT, reload); }, [reports.reload]);
  const athleteEnabled = user.athleteEnabled ?? user.athleteProfile ?? true;
  const coachEnabled = user.coachEnabled ?? user.coachProfile ?? false;
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
      if (change === 'rename') { const name = prompt('Nowa nazwa miejsca lądowania:', item.name); if (!name?.trim()) return; await api.updateExecutionType({ ...item, name: name.trim() }); }
      else if (change === 'hide') await api.updateExecutionType({ ...item, hidden: !item.hidden });
      else { const otherIndex = index + (change === 'up' ? -1 : 1); const other = items[otherIndex]; if (!other) return; await Promise.all([api.updateExecutionType({ ...item, sortOrder: other.sortOrder ?? otherIndex }), api.updateExecutionType({ ...other, sortOrder: item.sortOrder ?? index })]); }
      await executionTypes.reload(); setError(false); setMessage('Miejsca lądowania zostały zapisane.');
    } catch (reason) { setError(true); setMessage(reason instanceof Error ? reason.message : 'Nie udało się zapisać zmiany.'); }
  }
  async function addType() { const name = prompt('Nazwa nowego miejsca lądowania:'); if (!name?.trim()) return; try { await api.createExecutionType(name.trim()); await executionTypes.reload(); setMessage('Dodano miejsce lądowania.'); setError(false); } catch (reason) { setError(true); setMessage(reason instanceof Error ? reason.message : 'Nie udało się dodać miejsca.'); } }
  async function activateCoach() { try { const updated = await api.updateProfiles(athleteEnabled, true); onUserChange(updated); setError(false); setMessage('Profil trenera jest aktywny. Możesz się na niego przełączyć.'); } catch (reason) { setError(true); setMessage(reason instanceof Error ? reason.message : 'Nie udało się aktywować profilu trenera.'); } }
  async function deactivateCoach() {
    if (!confirm('Wyłączyć profil trenera? Dostęp do zawodników zostanie natychmiast wstrzymany, ale połączenia pozostaną zapisane.')) return;
    try { const updated = await api.updateProfiles(athleteEnabled, false); onUserChange(updated); setError(false); setMessage('Profil trenera został wyłączony. Połączenia zachowano.'); }
    catch (reason) { setError(true); setMessage(reason instanceof Error ? reason.message : 'Nie udało się wyłączyć profilu trenera.'); }
  }
  async function disconnectCoach(id: string, username: string) { if (!confirm(`Odłączyć trenera ${username}? Natychmiast straci dostęp do Twojej historii.`)) return; try { await api.disconnectCoach(id); await coaches.reload(); setError(false); setMessage('Trener został odłączony.'); } catch (reason) { setError(true); setMessage(reason instanceof Error ? reason.message : 'Nie udało się odłączyć trenera.'); } }
  return <div className="page"><PageHeader title="Profil i ustawienia" eyebrow="Twoje konto"/>
    <section className="profile-hero"><div className="avatar">{user.username.slice(0, 1).toUpperCase()}</div><div><h2>{user.username}</h2><span>Konto AcroNote</span></div></section>
    {pendingCoachInvitation && !coachEnabled && <section className="settings-card invitation-prompt"><h2>Zaproszenie od zawodnika</h2><p>Aby przyjąć to zaproszenie, najpierw aktywuj profil trenera. Po aktywacji wrócisz automatycznie do zaproszenia.</p><button className="button primary" onClick={() => void activateCoach()}>Aktywuj profil trenera</button></section>}
    <section className="settings-card"><h2>Aktywne profile</h2><div className="profile-option active"><span>↗</span><div><strong>Zawodnik</strong><small>Dziennik treningów, elementy i statystyki</small></div><b>Aktywny</b></div><div className={`profile-option ${coachEnabled ? 'active' : ''}`}><span>◎</span><div><strong>Trener</strong><small>{coachEnabled ? 'Podgląd połączonych zawodników · połączenia pozostają po wyłączeniu' : 'Podgląd połączonych zawodników'}</small></div>{coachEnabled ? <div className="profile-option-actions"><b>Aktywny</b><button className="danger-link" onClick={() => void deactivateCoach()}>Wyłącz</button></div> : <button className="button primary compact" onClick={() => void activateCoach()}>Aktywuj</button>}</div></section>
    <section className="settings-card"><h2>Wygląd</h2><p className="settings-copy">Wybierz motyw. Zielone akcenty pozostają takie same w obu wersjach.</p><div className="theme-options" role="group" aria-label="Motyw aplikacji"><button className={theme === 'light' ? 'active' : ''} aria-pressed={theme === 'light'} onClick={() => onThemeChange('light')}><span>☀</span><strong>Jasny</strong></button><button className={theme === 'dark' ? 'active' : ''} aria-pressed={theme === 'dark'} onClick={() => onThemeChange('dark')}><span>☾</span><strong>Ciemny</strong></button></div></section>
    <section className="settings-card"><h2>Bezpieczeństwo</h2>{!showPassword ? <button className="settings-row" onClick={() => setShowPassword(true)}><span>◇</span><div><strong>Zmień hasło</strong><small>Zaktualizuj hasło do swojego konta</small></div><i>›</i></button> : <form className="form-stack inset" onSubmit={changePassword}><label>Obecne hasło<input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} required autoComplete="current-password"/></label><label>Nowe hasło<input type="password" minLength={10} value={next} onChange={(e) => setNext(e.target.value)} required autoComplete="new-password"/></label><label>Powtórz nowe hasło<input type="password" minLength={10} value={repeat} onChange={(e) => setRepeat(e.target.value)} required autoComplete="new-password"/></label><div className="sheet-actions"><button className="button secondary" type="button" onClick={() => setShowPassword(false)}>Anuluj</button><button className="button primary">Zmień hasło</button></div></form>}</section>
    <section className="settings-card"><div className="settings-heading"><h2>Miejsca lądowania</h2><button onClick={() => void addType()}>+ Dodaj</button></div><p className="settings-copy">Ustaw miejsca, które można przypisać całemu wejściu, pojedynczemu elementowi albo każdej pozycji układu.</p><div className="execution-settings">{executionTypes.data?.map((item, index) => <div key={item.id} className={item.hidden ? 'hidden' : ''}><strong>{item.name === 'Na płasko' ? 'Siatka' : item.name}</strong><span>{item.hidden ? 'Ukryte' : 'Widoczne'}</span><button disabled={index === 0} aria-label="Wyżej" onClick={() => void updateType(item.id, 'up')}>↑</button><button disabled={index === executionTypes.data!.length - 1} aria-label="Niżej" onClick={() => void updateType(item.id, 'down')}>↓</button><button onClick={() => void updateType(item.id, 'rename')}>Zmień nazwę</button><button onClick={() => void updateType(item.id, 'hide')}>{item.hidden ? 'Przywróć' : 'Ukryj'}</button></div>)}</div></section>
    <section className="settings-card"><h2>Moi trenerzy</h2>{coaches.loading ? <p className="settings-copy">Ładowanie…</p> : coaches.error ? <p className="form-error">{coaches.error}</p> : coaches.data?.length ? <div className="linked-people">{coaches.data.map((coach) => <div key={coach.id}><span>{coach.username.slice(0, 1).toUpperCase()}</span><div><strong>{coach.username}</strong><small>Ma dostęp tylko do odczytu</small></div><button className="danger-link" onClick={() => void disconnectCoach(coach.id, coach.username)}>Odłącz</button></div>)}</div> : <p className="settings-copy">Nie masz jeszcze połączonego trenera.</p>}<InvitationPanel role="athlete" initialValue={invitation} onConnected={() => void coaches.reload()}/></section>
    <section className="settings-card"><h2>Pomoc</h2><button className="settings-row" onClick={openBugReport}><span>!</span><div><strong>Zgłoś problem</strong><small>Opisz, co nie działa. Dołączymy informacje techniczne, które pomogą to naprawić.</small></div><i>›</i></button>
      {!!reports.data?.length && <div className="report-list">{reports.data.map((item) => <div key={item.id}><span className={`report-status ${item.status}`}>{item.status === 'resolved' ? 'Rozwiązane' : 'Przyjęte'}</span><div><strong>#{item.id} · {item.createdAt.slice(0, 10)}</strong><small>{item.description}</small></div></div>)}</div>}</section>
    <button className="logout-button" onClick={() => void onLogout()}>Wyloguj się</button>
    <p className="version">AcroNote · wersja {__APP_VERSION__}</p>
    {message && <Toast message={message} kind={error ? 'error' : 'success'} onClose={() => setMessage('')}/>} 
  </div>;
}
