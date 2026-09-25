import { useMemo, useState } from 'react';
import { api } from '../api';
import { today, useAsync } from '../hooks';
import { ErrorState, Loading, PageHeader } from '../components/ui';

type Period = 'week' | 'month' | 'all';
function range(period: Period) {
  if (period === 'all') return {};
  const end = new Date(`${today()}T12:00:00`); const start = new Date(end);
  start.setDate(start.getDate() - (period === 'week' ? 6 : 29));
  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
}

export function StatsPage() {
  const [period, setPeriod] = useState<Period>('week');
  const dates = useMemo(() => range(period), [period]);
  const result = useAsync(() => api.stats(dates.from, dates.to), [dates.from, dates.to]);
  if (result.loading) return <Loading/>;
  if (result.error || !result.data) return <ErrorState message={result.error || 'Brak danych.'} retry={result.reload}/>;
  const max = Math.max(...result.data.timeline.map((x) => x.elements), 1);
  return <div className="page">
    <PageHeader title="Statystyki" eyebrow="Twój postęp"/>
    <div className="filter-row period">{([['week', '7 dni'], ['month', '30 dni'], ['all', 'Cały czas']] as const).map(([key, label]) => <button className={period === key ? 'active' : ''} onClick={() => setPeriod(key)} key={key}>{label}</button>)}</div>
    <section className="stats-grid"><article className="stat-card accent"><span>Wykonane elementy</span><strong>{result.data.elements.toLocaleString('pl-PL')}</strong><small>Łącznie w okresie</small></article><article className="stat-card"><span>Wejścia</span><strong>{result.data.entries}</strong><small>w {result.data.trainings} treningach</small></article><article className="stat-card"><span>Pełne układy</span><strong>{result.data.fullRoutines}</strong><small>+ {result.data.fragments} fragmentów</small></article></section>
    <section className="chart-card"><header><div><span>Aktywność</span><h2>Elementy w czasie</h2></div><span className="chart-legend"><i/> liczba elementów</span></header>{result.data.timeline.length ? <div className="bar-chart" role="img" aria-label="Wykres liczby elementów w czasie">{result.data.timeline.map((point) => <div className="bar-column" key={point.date} title={`${point.date}: ${point.elements}`}><span>{point.elements || ''}</span><i style={{ height: `${Math.max(3, point.elements / max * 100)}%` }}/><small>{new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'short' }).format(new Date(`${point.date}T12:00:00`))}</small></div>)}</div> : <p className="chart-empty">W tym okresie nie ma jeszcze zapisanych treningów.</p>}</section>
    <section className="ranking"><header><div><span>Najczęściej wykonywane</span><h2>Elementy</h2></div></header>{result.data.byCode.length ? result.data.byCode.slice(0, 12).map((item, index) => <div className="rank-row" key={item.code}><span>{index + 1}</span><strong>{item.code}</strong><div><i style={{ width: `${item.count / result.data!.byCode[0].count * 100}%` }}/></div><b>{item.count}×</b></div>) : <p className="chart-empty">Brak wykonanych elementów.</p>}</section>
  </div>;
}
