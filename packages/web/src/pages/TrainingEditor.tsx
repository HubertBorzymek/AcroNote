import { FormEvent, useMemo, useState } from 'react';
import { api } from '../api';
import { today, useAsync, useUnsavedChanges } from '../hooks';
import type { Activity, ElementItem, ExecutionType, Routine, Training, TrainingEntry } from '../types';
import { Counter, ErrorState, Icon, Loading, PageHeader, Toast } from '../components/ui';

const fallbackExecutionTypes: ExecutionType[] = [
  { id: 'flat', name: 'Siatka' }, { id: 'mat', name: 'Materac' }, { id: 'foam', name: 'Gąbki' },
];

export function TrainingEditor({ initial, onBack, onSaved, setGlobalDirty }: { initial?: Training; onBack: () => void; onSaved: () => void; setGlobalDirty: (dirty: boolean) => void }) {
  const sources = useAsync(async () => {
    const [elements, routines, executionTypes] = await Promise.all([api.elements(false), api.routines(), api.executionTypes().catch(() => fallbackExecutionTypes)]);
    return { elements, routines, executionTypes: (executionTypes.length ? executionTypes : fallbackExecutionTypes).map((type) => ({ ...type, name: type.name === 'Na płasko' ? 'Siatka' : type.name })) };
  }, []);
  const [date, setDate] = useState(initial?.date ?? today());
  const [savedId, setSavedId] = useState(initial?.id);
  const [entries, setEntries] = useState<TrainingEntry[]>(initial?.entries ? structuredClone(initial.entries) : []);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [picker, setPicker] = useState<{ entryIndex: number; type?: 'element' | 'routine' } | null>(null);
  const [editingActivity, setEditingActivity] = useState<{ entryIndex: number; activityIndex: number } | null>(null);
  const [showExitDialog, setShowExitDialog] = useState(false);
  useUnsavedChanges(dirty);

  const markDirty = () => { setDirty(true); setGlobalDirty(true); };
  function back() { if (dirty) return setShowExitDialog(true); setGlobalDirty(false); onBack(); }
  function updateEntry(index: number, update: (entry: TrainingEntry) => TrainingEntry) { setEntries(entries.map((entry, i) => i === index ? update(entry) : entry)); markDirty(); }
  function addEntry() {
    const execution = sources.data?.executionTypes[0] ?? fallbackExecutionTypes[0];
    setEntries([...entries, { defaultExecutionTypeId: execution.id, defaultExecutionTypeName: execution.name, activities: [] }]); markDirty();
  }
  function removeEntry(index: number) {
    if (entries[index].activities.length && !confirm('Usunąć wejście wraz ze wszystkimi czynnościami?')) return;
    setEntries(entries.filter((_, i) => i !== index)); markDirty();
  }
  function addElement(entryIndex: number, item: ElementItem) {
    const entry = entries[entryIndex];
    const activity: Activity = { type: 'element', repetitions: 1, elementId: item.id, elementCode: item.code, elementName: item.name, executionTypeId: entry.defaultExecutionTypeId, executionTypeName: entry.defaultExecutionTypeName };
    updateEntry(entryIndex, (current) => ({ ...current, activities: [...current.activities, activity] })); setPicker(null);
  }
  function addRoutine(entryIndex: number, routine: Routine, start: number, end: number) {
    const entry = entries[entryIndex];
    const selected = routine.slots.slice(start - 1, end);
    const activity: Activity = { type: 'routine', repetitions: 1, routineId: routine.id, routineName: routine.name, rangeStart: start, rangeEnd: end, isFullRoutine: start === 1 && end === routine.slots.length, executionTypeId: entry.defaultExecutionTypeId, executionTypeName: entry.defaultExecutionTypeName,
      elements: selected.map((slot) => { const current = sources.data?.elements.find((item) => item.id === slot.elementId); return { elementId: slot.elementId, code: slot.code ?? current?.code ?? '—', name: slot.name ?? current?.name, executionTypeId: entry.defaultExecutionTypeId, executionTypeName: entry.defaultExecutionTypeName }; }) };
    updateEntry(entryIndex, (current) => ({ ...current, activities: [...current.activities, activity] })); setPicker(null);
  }
  async function save(closeAfterSave = true) {
    if (!entries.length) { setMessage('Dodaj co najmniej jedno wejście.'); return false; }
    if (entries.some((entry) => !entry.activities.length)) { setMessage('Każde wejście powinno zawierać co najmniej jedną czynność.'); return false; }
    setSaving(true);
    try {
      const saved = savedId ? await api.updateTraining(savedId, { date, entries }) : await api.createTraining({ date, entries });
      setSavedId(saved.id); setDirty(false); setGlobalDirty(false);
      if (closeAfterSave) await onSaved(); else setMessage('Zapisano. Trener widzi już aktualne wejścia — możesz kontynuować trening.');
      return true;
    }
    catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Nie udało się zapisać treningu. Twoje dane pozostały w formularzu.'); }
    finally { setSaving(false); }
    return false;
  }
  async function removeTraining() {
    if (!savedId || !confirm('Usunąć ten trening? Tej operacji nie można cofnąć.')) return;
    try { await api.deleteTraining(savedId); setGlobalDirty(false); await onSaved(); }
    catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Nie udało się usunąć treningu.'); }
  }

  const total = useMemo(() => entries.reduce((sum, entry) => sum + entry.activities.reduce((activitySum, activity) => activitySum + (activity.type === 'element' ? activity.repetitions : (activity.elements?.length ?? 0) * activity.repetitions), 0), 0), [entries]);
  if (sources.loading) return <Loading/>;
  if (sources.error) return <ErrorState message={sources.error} retry={sources.reload}/>;
  return <div className="page editor-page">
    <PageHeader title={savedId ? 'Edytuj trening' : 'Nowy trening'} eyebrow={dirty ? 'Niezapisane zmiany' : savedId ? 'Zmiany widoczne dla trenera' : 'Dziennik'} onBack={back} action={<button className="button primary compact" onClick={() => void save(false)} disabled={saving}>{saving ? 'Zapisuję…' : 'Zapisz'}</button>}/>
    <section className="date-panel"><label>Data treningu<input type="date" value={date} onChange={(e) => { setDate(e.target.value); markDirty(); }}/></label><div><strong>{entries.length}</strong><span>wejść</span></div><div><strong>{total}</strong><span>elementów</span></div></section>
    <div className="entries-list">
      {entries.map((entry, entryIndex) => <section className="entry-card" key={entry.id ?? entryIndex}>
        <header><div><span>Wejście</span><h2>{entryIndex + 1}</h2></div><button className="danger-link" onClick={() => removeEntry(entryIndex)}>Usuń wejście</button></header>
        <label className="execution-select">Domyślne miejsce lądowania<select value={entry.defaultExecutionTypeId} onChange={(e) => { const type = sources.data!.executionTypes.find((x) => x.id === e.target.value)!; updateEntry(entryIndex, (current) => ({ ...current, defaultExecutionTypeId: type.id, defaultExecutionTypeName: type.name })); }}><option value="" disabled>Wybierz miejsce</option>{sources.data!.executionTypes.filter((x) => !x.hidden).map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}</select><small>Dotyczy nowych elementów. W układzie możesz wskazać inne lądowanie dla każdej pozycji.</small></label>
        <div className="activity-list">{entry.activities.map((activity, activityIndex) => <button className="activity" key={activity.id ?? activityIndex} onClick={() => setEditingActivity({ entryIndex, activityIndex })}>
          <span className={`activity-kind ${activity.type}`}>{activity.type === 'element' ? 'E' : 'U'}</span><div><strong>{activity.type === 'element' ? activity.elementCode : activity.routineName}</strong><small>{activity.type === 'routine' ? `${activity.isFullRoutine ? 'Cały układ' : `Elementy ${activity.rangeStart}–${activity.rangeEnd}`} · ${activity.elements?.map((x) => x.code).join(' · ')}` : activity.elementName || 'Pojedynczy element'}<br/>{activity.executionTypeName}</small></div><b>{activity.repetitions}×</b><span className="chevron">›</span>
        </button>)}</div>
        {!entry.activities.length && <p className="entry-empty">Dodaj element lub fragment układu wykonany podczas tego wejścia.</p>}
        <div className="add-activity"><button onClick={() => setPicker({ entryIndex, type: 'element' })}><span>✦</span> Element</button><button onClick={() => setPicker({ entryIndex, type: 'routine' })}><span>≋</span> Układ lub fragment</button></div>
      </section>)}
    </div>
    <button className="add-entry" onClick={addEntry}><Icon name="plus"/><span><strong>Dodaj wejście</strong><small>Kolejne wejście na trampolinę</small></span></button>
    {savedId && <button className="delete-training" onClick={() => void removeTraining()}>Usuń trening</button>}
    <div className="sticky-save"><span><strong>{entries.length}</strong> wejść · <strong>{total}</strong> elementów</span><div><button className="button secondary" onClick={() => void save(false)} disabled={saving}>{saving ? 'Zapisywanie…' : 'Zapisz i kontynuuj'}</button><button className="button primary" onClick={() => void save(true)} disabled={saving}>{saving ? 'Zapisywanie…' : 'Zapisz i zamknij'}</button></div></div>
    {picker?.type === 'element' && <ElementPicker elements={sources.data!.elements} onCreated={(element) => sources.setData({ ...sources.data!, elements: [...sources.data!.elements, element] })} onPick={(element) => addElement(picker.entryIndex, element)} onClose={() => setPicker(null)}/>}
    {picker?.type === 'routine' && <RoutinePicker routines={sources.data!.routines} onPick={(routine, start, end) => addRoutine(picker.entryIndex, routine, start, end)} onClose={() => setPicker(null)}/>}
    {editingActivity && <ActivityEditor activity={entries[editingActivity.entryIndex].activities[editingActivity.activityIndex]} executionTypes={sources.data!.executionTypes} onClose={() => setEditingActivity(null)} onDelete={() => { updateEntry(editingActivity.entryIndex, (entry) => ({ ...entry, activities: entry.activities.filter((_, i) => i !== editingActivity.activityIndex) })); setEditingActivity(null); }} onChange={(activity) => { updateEntry(editingActivity.entryIndex, (entry) => ({ ...entry, activities: entry.activities.map((item, i) => i === editingActivity.activityIndex ? activity : item) })); }}/>} 
    {showExitDialog && <div className="modal-backdrop above"><section className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="exit-title"><h2 id="exit-title">Zapisać trening?</h2><p>Masz niezapisane zmiany. Możesz je zapisać, odrzucić albo zostać w formularzu.</p><div><button className="button primary" disabled={saving} onClick={() => void save()}>{saving ? 'Zapisuję…' : 'Zapisz'}</button><button className="button danger" onClick={() => { setShowExitDialog(false); setGlobalDirty(false); onBack(); }}>Odrzuć</button><button className="button secondary" onClick={() => setShowExitDialog(false)}>Zostań</button></div></section></div>}
    {message && <Toast message={message} kind={message.startsWith('Zapisano.') ? 'success' : 'error'} onClose={() => setMessage('')}/>}
  </div>;
}

function ElementPicker({ elements, onCreated, onPick, onClose }: { elements: ElementItem[]; onCreated: (element: ElementItem) => void; onPick: (element: ElementItem) => void; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [favorite, setFavorite] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const list = elements.filter((item) => `${item.code} ${item.name ?? ''}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => Number(b.favorite) - Number(a.favorite));
  async function create(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError('');
    try { const element = await api.createElement({ code: query.trim(), name: name.trim(), favorite, hidden: false }); onCreated(element); setCreating(false); setName(''); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Nie udało się dodać elementu.'); }
    finally { setSaving(false); }
  }
  return <div className="modal-backdrop above"><section className="sheet picker"><PageHeader title={creating ? 'Nowy element' : 'Dodaj element'} onBack={creating ? () => setCreating(false) : onClose}/>{creating ? <form className="form-stack" onSubmit={create}><p className="picker-return">Po zapisaniu wrócisz do wyboru elementu w tym wejściu.</p><label>Kod elementu<input autoFocus required value={query} onChange={(e) => setQuery(e.target.value)} placeholder="np. 41o"/></label><label>Nazwa <span className="optional">opcjonalnie</span><input value={name} onChange={(e) => setName(e.target.value)} placeholder="np. Barani"/></label><label className="check-row"><input type="checkbox" checked={favorite} onChange={(e) => setFavorite(e.target.checked)}/><span><strong>Dodaj do ulubionych</strong></span></label>{error && <p className="form-error">{error}</p>}<button className="button primary full" disabled={saving}>{saving ? 'Dodaję…' : 'Dodaj i wróć'}</button></form> : <><div className="search"><Icon name="search"/><input autoFocus placeholder="Wpisz kod lub nazwę" value={query} onChange={(e) => setQuery(e.target.value)}/></div><button className="button secondary full picker-create" onClick={() => setCreating(true)}><Icon name="plus"/> Dodaj nowy element{query ? ` „${query}”` : ''}</button><div className="pick-list">{list.map((item) => <button key={item.id} onClick={() => onPick(item)}><strong>{item.code}</strong><span>{item.name || 'Bez nazwy'}</span>{item.favorite && <b>★</b>}</button>)}</div>{!list.length && <p className="picker-empty">Nie ma takiego elementu. Możesz dodać go tutaj bez utraty treningu.</p>}</>}</section></div>;
}

function RoutinePicker({ routines, onPick, onClose }: { routines: Routine[]; onPick: (routine: Routine, start: number, end: number) => void; onClose: () => void }) {
  const [selected, setSelected] = useState<Routine>();
  const [start, setStart] = useState(1); const [end, setEnd] = useState(1);
  return <div className="modal-backdrop above"><section className="sheet picker"><PageHeader title="Dodaj układ" onBack={selected ? () => setSelected(undefined) : onClose}/>{!selected ? <div className="pick-list routines">{routines.map((routine) => <button key={routine.id} onClick={() => { setSelected(routine); setStart(1); setEnd(routine.slots.length); }}><strong>{routine.name}</strong><span>{routine.slots.length} elementów · {routine.slots.map((x) => x.code).join(' · ')}</span><i>›</i></button>)}{!routines.length && <p className="picker-empty">Nie masz jeszcze żadnego układu.</p>}</div> : <div className="range-picker"><span className="kicker">{selected.name}</span><h2>Wybierz zakres</h2><div className="range-fields"><label>Od<select value={start} onChange={(e) => { const value = Number(e.target.value); setStart(value); setEnd(Math.max(end, value)); }}>{selected.slots.map((_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}</select></label><span>—</span><label>Do<select value={end} onChange={(e) => setEnd(Number(e.target.value))}>{selected.slots.map((_, i) => i + 1 >= start && <option key={i} value={i + 1}>{i + 1}</option>)}</select></label></div><div className="routine-preview selected">{selected.slots.slice(start - 1, end).map((slot, i) => <span key={i}><small>{start + i}</small>{slot.code}</span>)}</div><button className="button primary full" onClick={() => onPick(selected, start, end)}>{start === 1 && end === selected.slots.length ? 'Dodaj cały układ' : `Dodaj fragment ${start}–${end}`}</button></div>}</section></div>;
}

function ActivityEditor({ activity, executionTypes, onClose, onDelete, onChange }: { activity: Activity; executionTypes: ExecutionType[]; onClose: () => void; onDelete: () => void; onChange: (activity: Activity) => void }) {
  return <div className="modal-backdrop above"><section className="sheet"><PageHeader title="Edytuj wykonanie" onBack={onClose}/><div className="activity-editor"><div className="activity-title"><span className={`activity-kind ${activity.type}`}>{activity.type === 'element' ? 'E' : 'U'}</span><div><strong>{activity.type === 'element' ? activity.elementCode : activity.routineName}</strong><small>{activity.type === 'routine' ? `W tym wykonaniu: ${activity.elements?.map((x) => x.code).join(' · ')}` : activity.elementName || 'Pojedynczy element'}</small></div></div><div className="field-label"><span>Liczba powtórzeń</span></div><Counter value={activity.repetitions} onChange={(repetitions) => onChange({ ...activity, repetitions })}/><label>Miejsce lądowania<select value={activity.executionTypeId} onChange={(e) => { const type = executionTypes.find((x) => x.id === e.target.value)!; onChange({ ...activity, executionTypeId: type.id, executionTypeName: type.name }); }}><option value="" disabled>Wybierz</option>{executionTypes.map((type) => <option value={type.id} key={type.id}>{type.name}</option>)}</select><small>Dla układu to wartość startowa. Poniżej możesz zaznaczyć, że np. ostatni element był na materac, a wcześniejsze na siatkę.</small></label>{activity.type === 'routine' && <div className="snapshot-elements"><div className="field-label"><span>Gdzie lądował każdy element?</span></div>{activity.elements?.map((element, index) => <div key={index}><strong>{index + 1}. {element.code}</strong><select aria-label={`Lądowanie elementu ${index + 1}: ${element.code}`} value={element.executionTypeId} onChange={(e) => { const type = executionTypes.find((x) => x.id === e.target.value)!; onChange({ ...activity, elements: activity.elements!.map((item, i) => i === index ? { ...item, executionTypeId: type.id, executionTypeName: type.name } : item) }); }}>{executionTypes.map((type) => <option value={type.id} key={type.id}>{type.name}</option>)}</select></div>)}</div>}<button className="button secondary full" onClick={onClose}>Gotowe</button><button className="danger-link centered" onClick={onDelete}>Usuń tę czynność</button></div></section></div>;
}
