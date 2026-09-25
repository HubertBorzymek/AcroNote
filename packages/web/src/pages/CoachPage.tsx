import { useMemo, useState } from 'react';
import { api } from '../api';
import { useAsync } from '../hooks';
import type { CoachAthlete, ElementItem, Training } from '../types';
import { EmptyState, ErrorState, Loading, PageHeader, Toast } from '../components/ui';
import { InvitationPanel } from '../components/Connections';
import { StatsPage } from './StatsPage';

type AthleteTab = 'history' | 'elements' | 'routines' | 'stats';

function trainingTotals(training: Training) {
  let elements = 0;
  for (const entry of training.entries) for (const activity of entry.activities) elements += activity.type === 'element' ? activity.repetitions : (activity.elements?.length ?? 0) * activity.repetitions;
  return { entries: training.entries.length, elements };
}

function ReadOnlyTraining({ athleteId, training, onBack }: { athleteId: string; training: Training; onBack: () => void }) {
  const detail = useAsync(() => api.coachTraining(athleteId, training.id), [athleteId, training.id]);
  if (detail.loading) return <Loading/>;
  if (detail.error || !detail.data) return <ErrorState message={detail.error || 'Nie udało się wczytać treningu.'} retry={detail.reload}/>;
  const totals = trainingTotals(detail.data);
  return <div><PageHeader title={new Intl.DateTimeFormat('pl-PL', { dateStyle: 'long' }).format(new Date(`${detail.data.date}T12:00:00`))} eyebrow="Trening zawodnika · tylko odczyt" onBack={onBack}/><div className="readonly-summary"><span>{totals.entries} wejść</span><span>{totals.elements} wykonań elementów</span></div><div className="entries-list">{detail.data.entries.map((entry, entryIndex) => <article className="entry-card readonly-card" key={entry.id ?? entryIndex}><header><div><span>Wejście</span><h2>{entryIndex + 1}</h2></div><small>Domyślne lądowanie: {entry.defaultExecutionTypeName}</small></header><div className="activity-list">{entry.activities.map((activity, activityIndex) => <div className="activity readonly" key={activity.id ?? activityIndex}><span className={`activity-kind ${activity.type}`}>{activity.type === 'element' ? 'E' : 'U'}</span><div><strong>{activity.type === 'element' ? activity.elementCode : activity.routineName}</strong><small>{activity.repetitions}× · lądowanie: {activity.executionTypeName}</small>{activity.type === 'routine' && <ol className="readonly-elements">{activity.elements?.map((item, index) => <li key={index}><b>{item.code}</b><span>{item.executionTypeName}</span></li>)}</ol>}</div></div>)}</div></article>)}</div></div>;
}

function AthleteElements({ athleteId }: { athleteId: string }) {
  const elements = useAsync(() => api.coachElements(athleteId), [athleteId]);
  const [selected, setSelected] = useState<ElementItem | null>(null);
  const history = useAsync(() => selected ? api.coachElementHistory(athleteId, selected.id) : Promise.resolve([]), [athleteId, selected?.id]);
  if (elements.loading) return <Loading/>;
  if (elements.error) return <ErrorState message={elements.error} retry={elements.reload}/>;
  return <div className="coach-elements"><div className="element-grid">{elements.data?.map((item) => <button className={`element-card readonly ${selected?.id === item.id ? 'selected' : ''}`} key={item.id} onClick={() => setSelected(item)}><strong>{item.code}</strong><span>{item.name || 'Bez nazwy'}</span></button>)}</div>{selected && <section className="history-panel"><h2>Historia: {selected.code}</h2>{history.loading ? <Loading/> : history.error ? <ErrorState message={history.error} retry={history.reload}/> : history.data?.length ? history.data.map((item) => <div key={`${item.trainingId}-${item.date}`}><time>{new Intl.DateTimeFormat('pl-PL', { dateStyle: 'medium' }).format(new Date(`${item.date}T12:00:00`))}</time><strong>{item.count}×</strong><span>{item.landings?.map((landing) => `${landing.name}: ${landing.count}`).join(' · ')}</span></div>) : <p className="chart-empty">Ten element nie ma jeszcze zapisanych wykonań.</p>}</section>}</div>;
}

function AthleteDashboard({ athlete, onBack, onDisconnected }: { athlete: CoachAthlete; onBack: () => void; onDisconnected: () => void }) {
  const [tab, setTab] = useState<AthleteTab>('history');
  const [selectedTraining, setSelectedTraining] = useState<Training | null>(null);
  const [message, setMessage] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const trainings = useAsync(() => api.coachTrainings(athlete.id), [athlete.id]);
  const routines = useAsync(() => api.coachRoutines(athlete.id), [athlete.id]);
  const grouped = useMemo(() => Object.entries((trainings.data ?? []).reduce<Record<string, Training[]>>((all, item) => { (all[item.date] ??= []).push(item); return all; }, {})).sort(([a], [b]) => b.localeCompare(a)), [trainings.data]);
  if (selectedTraining) return <ReadOnlyTraining athleteId={athlete.id} training={selectedTraining} onBack={() => setSelectedTraining(null)}/>;
  async function disconnect() {
    if (!confirm(`Odłączyć zawodnika ${athlete.username}? Dostęp do jego danych zostanie natychmiast odebrany.`)) return;
    try { await api.disconnectAthlete(athlete.id); onDisconnected(); } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Nie udało się zakończyć połączenia.'); }
  }
  return <div><PageHeader title={athlete.username} eyebrow="Profil zawodnika · tylko odczyt" onBack={onBack} action={<button className="button secondary compact" onClick={() => { void Promise.all([trainings.reload(), routines.reload()]); setRefreshKey((value) => value + 1); }}>Odśwież</button>}/><div className="filter-row coach-tabs">{([['history', 'Historia'], ['elements', 'Elementy'], ['routines', 'Układy'], ['stats', 'Statystyki']] as const).map(([key, label]) => <button className={tab === key ? 'active' : ''} onClick={() => setTab(key)} key={key}>{label}</button>)}</div>
    {tab === 'history' && (trainings.loading ? <Loading/> : trainings.error ? <ErrorState message={trainings.error} retry={trainings.reload}/> : !grouped.length ? <EmptyState icon="↗" title="Brak treningów" description="Nowe zapisane wejścia pojawią się tutaj od razu."/> : <section className="timeline">{grouped.map(([date, items]) => <div className="day-group" key={date}><div className="day-heading"><time>{new Intl.DateTimeFormat('pl-PL', { dateStyle: 'medium' }).format(new Date(`${date}T12:00:00`))}</time><span>{items.length} treningów</span></div>{items.map((item) => { const totals = item.summary ?? trainingTotals(item); return <button className="training-card" key={item.id} onClick={() => setSelectedTraining(item)}><span className="training-index">{totals.entries}</span><div><strong>Trening</strong><small>{totals.entries} wejść · {totals.elements} wykonań elementów</small></div><span className="chevron">›</span></button>; })}</div>)}</section>)}
    {tab === 'elements' && <AthleteElements athleteId={athlete.id}/>} 
    {tab === 'routines' && (routines.loading ? <Loading/> : routines.error ? <ErrorState message={routines.error} retry={routines.reload}/> : <div className="routine-list">{routines.data?.map((routine) => <article className="routine-card" key={routine.id}><div className="routine-heading"><div><span>{routine.slots.length} elementów</span><h2>{routine.name}</h2></div></div><div className="routine-preview">{routine.slots.map((slot, index) => <span key={slot.id ?? index}><small>{index + 1}</small>{slot.code}</span>)}</div></article>)}</div>)}
    {tab === 'stats' && <StatsPage coachAthleteId={athlete.id} embedded refreshKey={refreshKey}/>}
    <button className="danger-link disconnect-link" onClick={() => void disconnect()}>Zakończ połączenie z zawodnikiem</button>
    {message && <Toast message={message} kind="error" onClose={() => setMessage('')}/>} 
  </div>;
}

export function CoachPage({ invitation = '' }: { invitation?: string }) {
  const athletes = useAsync(api.coachAthletes, []);
  const [selected, setSelected] = useState<CoachAthlete | null>(null);
  if (selected) return <AthleteDashboard athlete={selected} onBack={() => setSelected(null)} onDisconnected={() => { setSelected(null); void athletes.reload(); }}/>;
  if (athletes.loading) return <Loading/>;
  if (athletes.error) return <ErrorState message={athletes.error} retry={athletes.reload}/>;
  return <div className="page"><PageHeader title="Moi zawodnicy" eyebrow="Profil trenera"/><section className="coach-intro"><div><h2>Historia pod ręką</h2><p>Przeglądaj treningi, układy i statystyki swoich zawodników. Wszystkie dane są tylko do odczytu.</p></div><strong>{athletes.data?.length ?? 0}<small>połączonych</small></strong></section>{athletes.data?.length ? <section className="athlete-list">{athletes.data.map((athlete) => <button key={athlete.id} onClick={() => setSelected(athlete)}><span>{athlete.username.slice(0, 1).toUpperCase()}</span><div><strong>{athlete.username}</strong><small>Otwórz pełną historię</small></div><i>›</i></button>)}</section> : <EmptyState icon="◎" title="Dodaj pierwszego zawodnika" description="Połączcie konta krótkim kodem, linkiem albo QR."/>}<section className="settings-card"><h2>Połącz konto</h2><InvitationPanel role="coach" initialValue={invitation} onConnected={() => void athletes.reload()}/></section></div>;
}
