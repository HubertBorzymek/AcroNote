import { useMemo, useState } from 'react';
import { api } from '../api';
import { today, useAsync } from '../hooks';
import { ErrorState, Loading, PageHeader } from '../components/ui';

type Period = 'week' | 'month' | 'all';
function range(period: Period) {
  if (period === 'all') return {};
  const end = new Date(`${today()}T12:00:00`); const start = new Date(end);
  if (period === 'week') start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  else start.setDate(1);
  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
}

export function StatsPage({ coachAthleteId, embedded = false, refreshKey = 0 }: { coachAthleteId?: string; embedded?: boolean; refreshKey?: number } = {}) {
  const [period, setPeriod] = useState<Period>('week');
  const [elementId, setElementId] = useState('');
  const dates = useMemo(() => range(period), [period]);
  const elements = useAsync(() => coachAthleteId ? api.coachElements(coachAthleteId) : api.elements(false), [coachAthleteId, refreshKey]);
  const result = useAsync(() => coachAthleteId ? api.coachStats(coachAthleteId, dates.from, dates.to, elementId || undefined) : api.stats(dates.from, dates.to, elementId || undefined), [coachAthleteId, dates.from, dates.to, elementId, refreshKey]);
  if (result.loading || elements.loading) return <Loading/>;
  if (result.error || elements.error || !result.data) return <ErrorState message={result.error || elements.error || 'Brak danych.'} retry={() => void Promise.all([result.reload(), elements.reload()])}/>;
  const max = Math.max(...result.data.timeline.map((x) => x.elements), 1);
  const maxEntries = Math.max(...result.data.timeline.map((x) => x.entries), 1);
  const selected = elements.data?.find((item) => item.id === elementId);
  const landingData = selected ? result.data.landingByCode.find((item) => item.code === selected.code)?.landings ?? result.data.byLanding : result.data.byLanding;
  const landingTotal = landingData.reduce((sum, item) => sum + item.count, 0);
  return <div className="page">
    {!embedded && <PageHeader title="Statystyki" eyebrow="Twój postęp"/>}
    <div className="filter-row period">{([['week', 'Ten tydzień'], ['month', 'Ten miesiąc'], ['all', 'Cały czas']] as const).map(([key, label]) => <button className={period === key ? 'active' : ''} onClick={() => setPeriod(key)} key={key}>{label}</button>)}</div>
    <label className="stats-element-filter"><span>Pokaż wyniki</span><select value={elementId} onChange={(e) => setElementId(e.target.value)}><option value="">Wszystkie elementy</option>{elements.data?.map((item) => <option value={item.id} key={item.id}>{item.code}{item.name ? ` — ${item.name}` : ''}</option>)}</select></label>
    <section className="stats-grid"><article className="stat-card accent"><span>Wykonane elementy</span><strong>{result.data.elements.toLocaleString('pl-PL')}</strong><small>Łącznie w okresie</small></article><article className="stat-card"><span>Wejścia</span><strong>{result.data.entries}</strong><small>w {result.data.trainings} treningach</small></article><article className="stat-card"><span>Pełne układy</span><strong>{result.data.fullRoutines}</strong><small>+ {result.data.fragments} fragmentów</small></article></section>
    <section className="chart-card"><header><div><span>Aktywność</span><h2>{selected ? `${selected.code} w czasie` : 'Elementy w czasie'}</h2></div><span className="chart-legend"><i/> liczba wykonań</span></header>{result.data.timeline.length ? <div className="bar-chart" role="img" aria-label={`Wykres liczby wykonań${selected ? ` elementu ${selected.code}` : ''} w czasie`}>{result.data.timeline.map((point) => <div className="bar-column" key={point.date} title={`${point.date}: ${point.elements}`}><span>{point.elements || ''}</span><i style={{ height: `${Math.max(3, point.elements / max * 100)}%` }}/><small>{new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'short' }).format(new Date(`${point.date}T12:00:00`))}</small></div>)}</div> : <p className="chart-empty">W tym okresie nie ma jeszcze zapisanych wykonań.</p>}</section>
    <section className="chart-card"><header><div><span>Regularność</span><h2>Wejścia w czasie</h2></div><span className="chart-legend"><i/> liczba wejść</span></header>{result.data.timeline.length ? <div className="bar-chart entries" role="img" aria-label="Wykres liczby wejść w czasie">{result.data.timeline.map((point) => <div className="bar-column" key={point.date} title={`${point.date}: ${point.entries}`}><span>{point.entries || ''}</span><i style={{ height: `${Math.max(3, point.entries / maxEntries * 100)}%` }}/><small>{new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'short' }).format(new Date(`${point.date}T12:00:00`))}</small></div>)}</div> : <p className="chart-empty">W tym okresie nie ma jeszcze zapisanych wejść.</p>}</section>
    <section className="landing-stats"><header><div><span>Miejsca lądowania</span><h2>{selected ? `Gdzie lądował element ${selected.code}?` : 'Gdzie kończyły się elementy?'}</h2></div><small>W układach liczymy lądowanie każdego elementu osobno.</small></header>{landingData.length ? <div>{landingData.map((item) => <article key={item.name}><div><strong>{item.name}</strong><span>{item.count}× · {landingTotal ? Math.round(item.count / landingTotal * 100) : 0}%</span></div><i><b style={{ width: `${landingTotal ? item.count / landingTotal * 100 : 0}%` }}/></i></article>)}</div> : <p className="chart-empty">Brak informacji o miejscach lądowania w tym okresie.</p>}</section>
    <section className="ranking"><header><div><span>Najczęściej wykonywane</span><h2>Elementy</h2></div></header>{result.data.byCode.length ? result.data.byCode.slice(0, 12).map((item, index) => <div className="rank-row" key={item.code}><span>{index + 1}</span><strong>{item.code}</strong><div><i style={{ width: `${item.count / result.data!.byCode[0].count * 100}%` }}/></div><b>{item.count}×</b></div>) : <p className="chart-empty">Brak wykonanych elementów.</p>}</section>
  </div>;
}
