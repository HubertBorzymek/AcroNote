import { useMemo, useState } from 'react';
import { api } from '../api';
import { today, useAsync } from '../hooks';
import { ErrorState, Icon, Loading, PageHeader } from '../components/ui';
import type { Apparatus, TimeStatsItem } from '../types';
import { formatTime, formatTimeDelta } from '../time';
import { catalogOf, elementLabel } from '../elementFilters';
import { completedText, mostReliable, percent, successText } from '../completion';

const shortDate = (date: string) => new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'short' }).format(new Date(`${date}T12:00:00`));

/** Records, averages and progress of measured times (longer = better). */
/** "1 połączenie", "3 połączenia", "5 połączeń". */
function combosLabel(count: number) {
  const lastTwoDigits = count % 100; const lastDigit = count % 10;
  if (count === 1) return '1 połączenie';
  return lastDigit >= 2 && lastDigit <= 4 && !(lastTwoDigits >= 12 && lastTwoDigits <= 14) ? `${count} połączenia` : `${count} połączeń`;
}

function TimeStatsSection({ items, recentDays, showApparatus }: { items: TimeStatsItem[]; recentDays: number; showApparatus: boolean }) {
  return <section className="time-stats"><header><div><span>Czasy wykonania</span><h2>Rekordy i postęp</h2></div><small>Dłuższy czas jest lepszy. Liczymy każdy pomiar osobno, także elementy w układach.</small></header>
    <div className="time-stat-list">{items.map((item) => {
      const series = item.series.slice(-12); const top = Math.max(...series.map((point) => point.bestMs)); const last = item.series[item.series.length - 1]!;
      return <article className="time-stat" key={item.key}>
        <header><strong>{item.label}{item.name && <small className="variant-name"> {item.name}</small>}{showApparatus && item.apparatusName && <small className="apparatus-tag">{item.apparatusName}</small>}</strong><span className={`activity-kind ${item.kind}`}>{item.kind === 'element' ? 'E' : item.kind === 'combo' ? 'P' : 'U'}</span><small>{item.count} {item.count === 1 ? 'pomiar' : item.count < 5 ? 'pomiary' : 'pomiarów'}</small></header>
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

const STORED_APPARATUS = 'acronote.stats.apparatus';
const readStored = () => { try { return localStorage.getItem(STORED_APPARATUS); } catch { return null; } };
const store = (value: string) => { try { localStorage.setItem(STORED_APPARATUS, value); } catch { /* private mode: not remembered */ } };

/** Which apparatus the statistics show: the remembered choice, else the default (first visible); "all" only on request. */
export function statsApparatusChoice(apparatus: Apparatus[], stored: string | null): string {
  const visible = apparatus.filter((item) => !item.hidden);
  if (visible.length <= 1) return 'all';
  if (stored === 'all' || visible.some((item) => item.id === stored)) return stored!;
  return visible[0].id;
}

export function StatsPage(props: { coachAthleteId?: string; embedded?: boolean; refreshKey?: number } = {}) {
  const apparatus = useAsync(() => (props.coachAthleteId ? api.coachApparatus(props.coachAthleteId) : api.apparatus()).catch(() => [] as Apparatus[]), [props.coachAthleteId]);
  if (apparatus.loading) return <Loading/>;
  return <StatsView {...props} apparatus={apparatus.data ?? []}/>;
}

function StatsView({ coachAthleteId, embedded = false, refreshKey = 0, apparatus }: { coachAthleteId?: string; embedded?: boolean; refreshKey?: number; apparatus: Apparatus[] }) {
  const [period, setPeriod] = useState<Period>('week');
  // The athlete's choice is remembered on this device; a coach starts from the athlete's default apparatus.
  const [shown, setShown] = useState(() => statsApparatusChoice(apparatus, coachAthleteId ? null : readStored()));
  const apparatusId = shown === 'all' ? undefined : shown;
  const choose = (value: string) => { setShown(value); if (!coachAthleteId) store(value); };
  const visibleApparatus = apparatus.filter((item) => !item.hidden);
  const [elementId, setElementId] = useState('');
  const [finishedOnly, setFinishedOnly] = useState(false);
  const dates = useMemo(() => range(period), [period]);
  const elements = useAsync(() => coachAthleteId ? api.coachElements(coachAthleteId) : api.elements(false), [coachAthleteId, refreshKey]);
  const times = useAsync(() => coachAthleteId ? api.coachTimeStats(coachAthleteId, dates.from, dates.to, apparatusId, finishedOnly) : api.timeStats(dates.from, dates.to, apparatusId, finishedOnly), [coachAthleteId, dates.from, dates.to, apparatusId, finishedOnly, refreshKey]);
  const result = useAsync(() => coachAthleteId ? api.coachStats(coachAthleteId, dates.from, dates.to, elementId || undefined, apparatusId, finishedOnly) : api.stats(dates.from, dates.to, elementId || undefined, apparatusId, finishedOnly), [coachAthleteId, dates.from, dates.to, elementId, apparatusId, finishedOnly, refreshKey]);
  if (result.loading || elements.loading) return <Loading/>;
  if (result.error || elements.error || !result.data) return <ErrorState message={result.error || elements.error || 'Brak danych.'} retry={() => void Promise.all([result.reload(), elements.reload()])}/>;
  const max = Math.max(...result.data.timeline.map((x) => x.elements), 1);
  const maxEntries = Math.max(...result.data.timeline.map((x) => x.entries), 1);
  // With one apparatus chosen, only elements of its notation make sense in the element filter.
  const shownCatalog = apparatus.find((item) => item.id === shown)?.catalog;
  const shownElements = (elements.data ?? []).filter((item) => !shownCatalog || catalogOf(item) === shownCatalog);
  const selected = shownElements.find((item) => item.id === elementId);
  // Per element: a variant with the same code (e.g. 40o from the back) has its own landings, times and ranking row.
  const landingData = selected ? result.data.byElement.find((item) => item.elementId === selected.id)?.landings ?? result.data.landingByCode.find((item) => item.code === selected.code)?.landings ?? result.data.byLanding : result.data.byLanding;
  const landingTotal = landingData.reduce((sum, item) => sum + item.count, 0);
  const timeItems = (times.data?.items ?? []).filter((item) => !selected || (item.kind === 'element' && (item.elementId != null ? String(item.elementId) === selected.id : item.label === selected.code)));
  const selectedStats = selected ? result.data.byElement.find((item) => item.elementId === selected.id) : undefined;
  const reliable = result.data.byElement.some((item) => item.failed > 0) ? mostReliable(result.data.byElement) : [];
  const ranking = result.data.byElement.length ? result.data.byElement : result.data.byCode.map((item) => ({ ...item, key: item.code, name: null }));
  return <div className="page">
    {!embedded && <PageHeader title="Statystyki" eyebrow="Twój postęp"/>}
    {visibleApparatus.length > 1 && <div className="filter-row apparatus-switch" role="group" aria-label="Sprzęt">{[...visibleApparatus, { id: 'all', name: 'Wszystkie sprzęty' }].map((item) => <button key={item.id} className={shown === item.id ? 'active' : ''} aria-pressed={shown === item.id} onClick={() => choose(item.id)}>{item.name}</button>)}</div>}
    <div className="filter-row period">{([['week', 'Ten tydzień'], ['month', 'Ten miesiąc'], ['all', 'Cały czas']] as const).map(([key, label]) => <button className={period === key ? 'active' : ''} onClick={() => setPeriod(key)} key={key}>{label}</button>)}</div>
    <div className="stats-element-filter"><label><span>Pokaż wyniki</span><select value={elementId} onChange={(e) => setElementId(e.target.value)}><option value="">Wszystkie elementy</option>{shownElements.map((item) => <option value={item.id} key={item.id}>{item.code} — {elementLabel(item)}</option>)}</select></label><label className="finished-only"><input type="checkbox" checked={finishedOnly} onChange={(e) => setFinishedOnly(e.target.checked)}/><span>Tylko ukończone wejścia</span></label></div>
    <section className="stats-grid"><article className="stat-card accent"><span>Wykonane elementy</span><strong>{result.data.elements.toLocaleString('pl-PL')}</strong><small>{selectedStats && selectedStats.failed > 0 ? successText(selectedStats.count, selectedStats.failed) : 'Łącznie w okresie'}</small></article><article className="stat-card"><span>Wejścia</span><strong>{result.data.entries}</strong><small>w {result.data.trainings} treningach{result.data.unfinishedEntries > 0 && <span className="unfinished-note">{completedText(result.data.entries, result.data.unfinishedEntries)} ({percent(result.data.entries - result.data.unfinishedEntries, result.data.entries)}%)</span>}</small></article><article className="stat-card"><span>Pełne układy</span><strong>{result.data.fullRoutines}</strong><small>+ {result.data.fragments} fragmentów{result.data.combos > 0 && ` · ${combosLabel(result.data.combos)}`}</small></article></section>
    {!!timeItems.length && <TimeStatsSection items={timeItems} recentDays={times.data!.recentDays} showApparatus={shown === 'all' && visibleApparatus.length > 1}/>}
    <section className="chart-card"><header><div><span>Aktywność</span><h2>{selected ? `${selected.code} w czasie` : 'Elementy w czasie'}</h2></div><span className="chart-legend"><i/> liczba wykonań</span></header>{result.data.timeline.length ? <div className="bar-chart" role="img" aria-label={`Wykres liczby wykonań${selected ? ` elementu ${selected.code}` : ''} w czasie`}>{result.data.timeline.map((point) => <div className="bar-column" key={point.date} title={`${point.date}: ${point.elements}`}><span>{point.elements || ''}</span><i style={{ height: `${Math.max(3, point.elements / max * 100)}%` }}/><small>{new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'short' }).format(new Date(`${point.date}T12:00:00`))}</small></div>)}</div> : <p className="chart-empty">W tym okresie nie ma jeszcze zapisanych wykonań.</p>}</section>
    <section className="chart-card"><header><div><span>Regularność</span><h2>Wejścia w czasie</h2></div><span className="chart-legend"><i/> liczba wejść</span></header>{result.data.timeline.length ? <div className="bar-chart entries" role="img" aria-label="Wykres liczby wejść w czasie">{result.data.timeline.map((point) => <div className="bar-column" key={point.date} title={`${point.date}: ${point.entries}`}><span>{point.entries || ''}</span><i style={{ height: `${Math.max(3, point.entries / maxEntries * 100)}%` }}/><small>{new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'short' }).format(new Date(`${point.date}T12:00:00`))}</small></div>)}</div> : <p className="chart-empty">W tym okresie nie ma jeszcze zapisanych wejść.</p>}</section>
    <section className="landing-stats"><header><div><span>Miejsca lądowania</span><h2>{selected ? `Gdzie lądował element ${selected.code}?` : 'Gdzie kończyły się elementy?'}</h2></div><small>W układach liczymy lądowanie każdego elementu osobno.</small></header>{landingData.length ? <div>{landingData.map((item) => <article key={item.name}><div><strong>{item.name}</strong><span>{item.count}× · {landingTotal ? Math.round(item.count / landingTotal * 100) : 0}%</span></div><i><b style={{ width: `${landingTotal ? item.count / landingTotal * 100 : 0}%` }}/></i></article>)}</div> : <p className="chart-empty">Brak informacji o miejscach lądowania w tym okresie.</p>}</section>
    {!!reliable.length && <section className="ranking reliable"><header><div><span>Skuteczność</span><h2>Najpewniejsze elementy</h2></div><small>Udane to wszystkie wykonania poza ostatnim elementem nieukończonego wejścia.</small></header>{reliable.map((item, index) => <div className="rank-row" key={item.key}><span>{index + 1}</span><strong>{item.code}{item.name && <small className="variant-name"> {item.name}</small>}</strong><div><i style={{ width: `${percent(item.count - item.failed, item.count)}%` }}/></div><b>{percent(item.count - item.failed, item.count)}%</b><small className="reliable-detail">{successText(item.count, item.failed)}</small></div>)}</section>}
    <section className="ranking"><header><div><span>Najczęściej wykonywane</span><h2>Elementy</h2></div></header>{ranking.length ? ranking.slice(0, 12).map((item, index) => <div className="rank-row" key={item.key}><span>{index + 1}</span><strong>{item.code}{item.name && <small className="variant-name"> {item.name}</small>}</strong><div><i style={{ width: `${item.count / ranking[0].count * 100}%` }}/></div><b>{item.count}×</b></div>) : <p className="chart-empty">Brak wykonanych elementów.</p>}</section>
  </div>;
}
