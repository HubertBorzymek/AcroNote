import { useMemo, useState } from 'react';
import { api } from '../api';
import { useAsync } from '../hooks';
import type { Training } from '../types';
import { EmptyState, ErrorState, Icon, Loading, PageHeader, Toast } from '../components/ui';
import { TrainingEditor } from './TrainingEditor';

function summarize(training: Training) {
  let elements = 0;
  for (const entry of training.entries) for (const activity of entry.activities) {
    elements += activity.type === 'element' ? activity.repetitions : (activity.elements?.length ?? 0) * activity.repetitions;
  }
  return { entries: training.entries.length, elements };
}

export function TrainingsPage({ setDirty }: { setDirty: (dirty: boolean) => void }) {
  const result = useAsync(api.trainings, []);
  // Apparatus names on the cards only matter when the athlete jumps on more than one apparatus.
  const apparatus = useAsync(() => api.apparatus().catch(() => []), []);
  const showApparatus = (apparatus.data ?? []).filter((item) => !item.hidden).length > 1;
  const [editing, setEditing] = useState<Training | 'new' | null>(null);
  const [message, setMessage] = useState('');
  const grouped = useMemo(() => Object.entries((result.data ?? []).reduce<Record<string, Training[]>>((all, training) => {
    (all[training.date] ??= []).push(training); return all;
  }, {})).sort(([a], [b]) => b.localeCompare(a)), [result.data]);

  if (editing) return <TrainingEditor initial={editing === 'new' ? undefined : editing} onBack={() => { setEditing(null); void result.reload(); }} onSaved={async (savedMessage) => { await result.reload(); setEditing(null); setMessage(savedMessage ?? 'Trening został zapisany.'); }} setGlobalDirty={setDirty}/>;
  if (result.loading) return <Loading/>;
  if (result.error) return <ErrorState message={result.error} retry={result.reload}/>;
  // One way to add a training: the "Nowy" button (top right; pinned above the bottom bar on phones).
  return <div className="page trainings-page">
    <PageHeader title="Treningi" eyebrow="Twój dziennik" action={<button className="button primary compact new-training" onClick={() => setEditing('new')}><Icon name="plus"/> Nowy</button>}/>
    {!grouped.length ? <EmptyState icon="journal" title="Zacznij prowadzić dziennik" description="Dotknij „Nowy”, a każde wejście i wykonany element trafią do Twojej historii."/>
      : <section className="timeline"><h2>Historia treningów</h2>{grouped.map(([date, trainings]) => <div className="day-group" key={date}>
        <div className="day-heading"><time>{new Intl.DateTimeFormat('pl-PL', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(`${date}T12:00:00`))}</time><span>{trainings.length} {trainings.length === 1 ? 'trening' : 'treningi'}</span></div>
        {trainings.map((training, index) => { const summary = training.summary ?? summarize(training); return <button className="training-card" key={training.id} onClick={() => { void api.training(training.id).then(setEditing).catch((reason) => setMessage(reason instanceof Error ? reason.message : 'Nie udało się pobrać treningu.')); }}><span className="training-index">{index + 1}</span><div><strong>Trening {index + 1}</strong><small>{summary.entries} wejść · {summary.elements} wykonań elementów{showApparatus && training.apparatusNames?.length ? ` · ${training.apparatusNames.join(', ')}` : ''}</small></div>{training.rating != null && <span className="rating-badge" aria-label={`Ocena ${training.rating} na 10`}>{training.rating}/10</span>}<span className="chevron">›</span></button>; })}
      </div>)}</section>}
    {message && <Toast message={message} onClose={() => setMessage('')}/>}
  </div>;
}
