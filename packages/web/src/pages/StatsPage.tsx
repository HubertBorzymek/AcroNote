import { useMemo, useState } from 'react';
import { api } from '../api';
import { today, useAsync } from '../hooks';
import { ErrorState, Icon, Loading, PageHeader } from '../components/ui';
import type { TimeStatsItem } from '../types';
import { formatTime, formatTimeDelta } from '../time';

const shortDate = (date: string) => new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'short' }).format(new Date(`${date}T12:00:00`));

/** Records, averages and progress of measured times (longer = better). */
function TimeStatsSection({ items, recentDays }: { items: TimeStatsItem[]; recentDays: number }) {
  return <section className="time-stats"><header><div><span>Czasy wykonania</span><h2>Rekordy i postęp</h2></div><small>Dłuższy czas jest lepszy. Liczymy każdy pomiar osobno, także elementy w układach.</small></header>
    <div className="time-stat-list">{items.map((item) => {
      const series = item.series.slice(-12); const top = Math.max(...series.map((point) => point.bestMs)); const last = item.series[item.series.length - 1]!;
      return <article className="time-stat" key={item.key}>
        <header><strong>{item.label}</strong><span className={`activity-kind ${item.kind}`}>{item.kind === 'element' ? 'E' : 'U'}</span><small>{item.count} {item.count === 1 ? 'pomiar' : item.count < 5 ? 'pomiary' : 'pomiarów'}</small></header>
        <div className="time-figures">
          <div className="record"><span>Rekord</span><strong>{formatTime(item.bestMs)}</strong><small>{shortDate(item.bestDate)}</small></div>
          <div><span>Średnia</span><strong>{formatTime(item.avgMs)}</strong></div>
          <div><span>Ostatni</span><strong>{formatTime(item.lastMs)}</strong><small>{shortDate(item.lastDate)}</small></div>
          {item.trendMs !== null && <div className={item.trendMs > 0 ? 'up' : item.trendMs < 0 ? 'down' : ''}><span>{recentDays} dni vs wcześniej</span><strong>{formatTimeDelta(item.trendMs)}</strong></div>}
        </div>
        {series.length > 1 && <div className="time-chart" role="img" aria-label={`Najlepszy czas ${item.label} w kolejnych treningach`}>{series.map((point) => <div key={point.trainingId} title={`${point.date}: najlepszy ${formatTime(point.bestMs)}, średnia ${formatTime(point.avgMs)}`}><i style={{ height: `${Math.max(8, point.bestMs / top * 100)}%` }} className={point.bestMs === item.bestMs ? 'best' : ''}/><small>{shortDate(point.date)}</small></div>)}</div>}
        {last.count > 1 && <p className="time-spread"><Icon name="clock"/> Ostatni trening: {last.count} pomiary, od {formatTime(last.worstMs)} do {formatTime(last.bestMs)} (rozrzut {formatTime(last.bestMs - last.worstMs)})</p>}
      </article>;
    })}</div>
  </section>;
}

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
  const times = useAsync(() => coachAthleteId ? api.coachTimeStats(coachAthleteId, dates.from, dates.to) : api.timeStats(dates.from, dates.to), [coachAthleteId, dates.from, dates.to, refreshKey]);
  const result = useAsync(() => coachAthleteId ? api.coachStats(coachAthleteId, dates.from, dates.to, elementId || undefined) : api.stats(dates.from, dates.to, elementId || undefined), [coachAthleteId, dates.from, dates.to, elementId, refreshKey]);
  if (result.loading || elements.loading) return <Loading/>;
  if (result.error || elements.error || !result.data) return <ErrorState message={result.error || elements.error || 'Brak danych.'} retry={() => void Promise.all([result.reload(), elements.reload()])}/>;
  const max = Math.max(...result.data.timeline.map((x) => x.elements), 1);
  const maxEntries = Math.max(...result.data.timeline.map((x) => x.entries), 1);
  const selected = elements.data?.find((item) => item.id === elementId);
  const landingData = selected ? result.data.landingByCode.find((item) => item.code === selected.code)?.landings ?? result.data.byLanding : result.data.byLanding;
  const landingTotal = landingData.reduce((sum, item) => sum + item.count, 0);
  const timeItems = (times.data?.items ?? []).filter((item) => !selected || item.key === `element:${selected.code}`);
  return <div className="page">
    {!embedded && <PageHeader title="Statystyki" eyebrow="Twój postęp"/>}
    <div className="filter-row period">{([['week', 'Ten tydzień'], ['month', 'Ten miesiąc'], ['all', 'Cały czas']] as const).map(([key, label]) => <button className={period === key ? 'active' : ''} onClick={() => setPeriod(key)} key={key}>{label}</button>)}</div>
    <label className="stats-element-filter"><span>Pokaż wyniki</span><select value={elementId} onChange={(e) => setElementId(e.target.value)}><option value="">Wszystkie elementy</option>{elements.data?.map((item) => <option value={item.id} key={item.id}>{item.code}{item.name ? ` — ${item.name}` : ''}</option>)}</select></label>
    <section className="stats-grid"><article className="stat-card accent"><span>Wykonane elementy</span><strong>{result.data.elements.toLocaleString('pl-PL')}</strong><small>Łącznie w okresie</small></article><article className="stat-card"><span>Wejścia</span><strong>{result.data.entries}</strong><small>w {result.data.trainings} treningach</small></article><article className="stat-card"><span>Pełne układy</span><strong>{result.data.fullRoutines}</strong><small>+ {result.data.fragments} fragmentów</small></article></section>
    {!!timeItems.length && <TimeStatsSection items={timeItems} recentDays={times.data!.recentDays}/>}
    <section className="chart-card"><header><div><span>Aktywność</span><h2>{selected ? `${selected.code} w czasie` : 'Elementy w czasie'}</h2></div><span className="chart-legend"><i/> liczba wykonań</span></header>{result.data.timeline.length ? <div className="bar-chart" role="img" aria-label={`Wykres liczby wykonań${selected ? ` elementu ${selected.code}` : ''} w czasie`}>{result.data.timeline.map((point) => <div className="bar-column" key={point.date} title={`${point.date}: ${point.elements}`}><span>{point.elements || ''}</span><i style={{ height: `${Math.max(3, point.elements / max * 100)}%` }}/><small>{new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'short' }).format(new Date(`${point.date}T12:00:00`))}</small></div>)}</div> : <p className="chart-empty">W tym okresie nie ma jeszcze zapisanych wykonań.</p>}</section>
    <section className="chart-card"><header><div><span>Regularność</span><h2>Wejścia w czasie</h2></div><span className="chart-legend"><i/> liczba wejść</span></header>{result.data.timeline.length ? <div className="bar-chart entries" role="img" aria-label="Wykres liczby wejść w czasie">{result.data.timeline.map((point) => <div className="bar-column" key={point.date} title={`${point.date}: ${point.entries}`}><span>{point.entries || ''}</span><i style={{ height: `${Math.max(3, point.entries / maxEntries * 100)}%` }}/><small>{new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'short' }).format(new Date(`${point.date}T12:00:00`))}</small></div>)}</div> : <p className="chart-empty">W tym okresie nie ma jeszcze zapisanych wejść.</p>}</section>
    <section className="landing-stats"><header><div><span>Miejsca lądowania</span><h2>{selected ? `Gdzie lądował element ${selected.code}?` : 'Gdzie kończyły się elementy?'}</h2></div><small>W układach liczymy lądowanie każdego elementu osobno.</small></header>{landingData.length ? <div>{landingData.map((item) => <article key={item.name}><div><strong>{item.name}</strong><span>{item.count}× · {landingTotal ? Math.round(item.count / landingTotal * 100) : 0}%</span></div><i><b style={{ width: `${landingTotal ? item.count / landingTotal * 100 : 0}%` }}/></i></article>)}</div> : <p className="chart-empty">Brak informacji o miejscach lądowania w tym okresie.</p>}</section>
    <section className="ranking"><header><div><span>Najczęściej wykonywane</span><h2>Elementy</h2></div></header>{result.data.byCode.length ? result.data.byCode.slice(0, 12).map((item, index) => <div className="rank-row" key={item.code}><span>{index + 1}</span><strong>{item.code}</strong><div><i style={{ width: `${item.count / result.data!.byCode[0].count * 100}%` }}/></div><b>{item.count}×</b></div>) : <p className="chart-empty">Brak wykonanych elementów.</p>}</section>
  </div>;
}
