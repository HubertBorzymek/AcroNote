import { FormEvent, useMemo, useRef, useState } from 'react';
import { api } from '../api';
import { today, useAsync, useUnsavedChanges } from '../hooks';
import type { Activity, ElementItem, ExecutionType, Routine, TimeRecord, Training, TrainingEntry } from '../types';
import { CodeHint, ConfirmDialog, Counter, ErrorState, Icon, Loading, NonStandardCodeText, PageHeader, Toast } from '../components/ui';
import { parseElementCode, standardElementName } from '../elementCode';
import { ElementFilterControls, emptyElementFilters, filterElementChoices } from '../elementFilters';
import { formatTime, parseSeconds } from '../time';

const fallbackExecutionTypes: ExecutionType[] = [
  { id: 'flat', name: 'Siatka' }, { id: 'mat', name: 'Materac' }, { id: 'foam', name: 'Gąbki' },
];

function elementCountLabel(count: number) {
  const lastTwoDigits = count % 100;
  const lastDigit = count % 10;
  if (count === 1) return '1 element';
  if (lastDigit >= 2 && lastDigit <= 4 && !(lastTwoDigits >= 12 && lastTwoDigits <= 14)) return `${count} elementy`;
  return `${count} elementów`;
}

export function newestEntryIndexes(total: number, visibleCount: number) {
  return Array.from({ length: Math.min(total, visibleCount) }, (_, offset) => total - offset - 1);
}

const activityElements = (activity: Activity) => activity.type === 'element' ? activity.repetitions : (activity.elements?.length ?? 0) * activity.repetitions;
export const hasTimes = (activity: Activity) => activity.timeMs != null || !!activity.elements?.some((item) => item.timeMs != null);

/** One line for a collapsed entry, e.g. "40o ×10 · 41o 1,234 s · Układ A". */
export function entrySummary(entry: TrainingEntry) {
  if (!entry.activities.length) return 'Brak czynności';
  return entry.activities.map((activity) => {
    const name = activity.type === 'element' ? activity.elementCode ?? '' : `${activity.routineName ?? 'Układ'}${activity.isFullRoutine ? '' : ` ${activity.rangeStart}–${activity.rangeEnd}`}`;
    return `${name}${activity.repetitions > 1 ? ` ×${activity.repetitions}` : ''}${activity.timeMs != null ? ` ${formatTime(activity.timeMs)}` : ''}`;
  }).join(' · ');
}

/** A copy for the next measured execution: always ×1 and without times. */
export function nextTimedCopy(activity: Activity): Activity {
  return { ...activity, id: undefined, repetitions: 1, timeMs: null, elements: activity.elements?.map((item) => ({ ...item, timeMs: null })) };
}

/** The same element or routine range, ×1 and still without any time. */
export function isWaitingForTime(candidate: Activity | undefined, current: Activity) {
  if (!candidate || candidate.repetitions !== 1 || hasTimes(candidate) || candidate.type !== current.type) return false;
  return current.type === 'element' ? candidate.elementCode === current.elementCode : candidate.routineId === current.routineId && candidate.rangeStart === current.rangeStart && candidate.rangeEnd === current.rangeEnd;
}

/** "40o ×5" with a time becomes five positions ×1, so every execution can have its own time. */
export function splitRepetitions(activity: Activity): Activity[] {
  return Array.from({ length: activity.repetitions }, (_, index) => index === 0 ? { ...activity, repetitions: 1 } : nextTimedCopy(activity));
}

function recordsMessage(records: TimeRecord[] | undefined) {
  if (!records?.length) return undefined;
  return `Nowy rekord: ${records.map((item) => `${item.label} — ${formatTime(item.timeMs)}`).join(', ')}`;
}

type EditingActivity = { entryIndex: number; activityIndex: number; focusTime?: boolean; seq?: number };

export function TrainingEditor({ initial, onBack, onSaved, setGlobalDirty }: { initial?: Training; onBack: () => void; onSaved: (message?: string) => void | Promise<void>; setGlobalDirty: (dirty: boolean) => void }) {
  const sources = useAsync(async () => {
    const [elements, routines, executionTypes] = await Promise.all([api.elements(false), api.routines(), api.executionTypes().catch(() => fallbackExecutionTypes)]);
    return { elements, routines, executionTypes: (executionTypes.length ? executionTypes : fallbackExecutionTypes).map((type) => ({ ...type, name: type.name === 'Na płasko' ? 'Siatka' : type.name })) };
  }, []);
  const keyCounter = useRef(0);
  const newKey = () => `entry-${++keyCounter.current}`;
  const [date, setDate] = useState(initial?.date ?? today());
  const [savedId, setSavedId] = useState(initial?.id);
  const [entries, setEntries] = useState<TrainingEntry[]>(() => (initial?.entries ? structuredClone(initial.entries) : []).map((entry) => ({ ...entry, clientKey: newKey() })));
  // When an existing training opens, only the newest entry is expanded.
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set(entries.slice(0, -1).map((entry) => entry.clientKey!)));
  const [rating, setRating] = useState<number | null>(initial?.rating ?? null);
  const [comment, setComment] = useState(initial?.comment ?? '');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [picker, setPicker] = useState<{ entryIndex: number; type?: 'element' | 'routine' } | null>(null);
  const [editingActivity, setEditingActivity] = useState<EditingActivity | null>(null);
  const [showExitDialog, setShowExitDialog] = useState(false);
  const [visibleEntryCount, setVisibleEntryCount] = useState(5);
  useUnsavedChanges(dirty);

  const markDirty = () => { setDirty(true); setGlobalDirty(true); };
  function back() { if (dirty) return setShowExitDialog(true); setGlobalDirty(false); onBack(); }
  function updateEntry(index: number, update: (entry: TrainingEntry) => TrainingEntry) { setEntries((current) => current.map((entry, i) => i === index ? update(entry) : entry)); markDirty(); }
  function toggleEntry(key: string) { setCollapsed((current) => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next; }); }
  function addEntry() {
    const execution = sources.data?.executionTypes[0] ?? fallbackExecutionTypes[0];
    // Previous entries fold away, so on a phone only the entry being filled in is open.
    setCollapsed(new Set(entries.map((entry) => entry.clientKey!)));
    setEntries([...entries, { defaultExecutionTypeId: execution.id, defaultExecutionTypeName: execution.name, activities: [], clientKey: newKey() }]);
    setVisibleEntryCount((current) => current > 5 ? current + 1 : 5);
    markDirty();
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
    const activity: Activity = { type: 'routine', repetitions: 1, routineId: routine.id, routineName: routine.name, sourceTemplateVersion: routine.templateVersion, rangeStart: start, rangeEnd: end, isFullRoutine: start === 1 && end === routine.slots.length, executionTypeId: entry.defaultExecutionTypeId, executionTypeName: entry.defaultExecutionTypeName,
      elements: selected.map((slot) => { const current = sources.data?.elements.find((item) => item.id === slot.elementId); return { elementId: slot.elementId, code: slot.code ?? current?.code ?? '—', name: slot.name ?? current?.name, executionTypeId: entry.defaultExecutionTypeId, executionTypeName: entry.defaultExecutionTypeName }; }) };
    updateEntry(entryIndex, (current) => ({ ...current, activities: [...current.activities, activity] })); setPicker(null);
  }
  function splitActivity({ entryIndex, activityIndex }: EditingActivity) {
    updateEntry(entryIndex, (entry) => ({ ...entry, activities: entry.activities.flatMap((item, i) => i === activityIndex ? splitRepetitions(item) : [item]) }));
    setEditingActivity({ entryIndex, activityIndex, focusTime: true, seq: Date.now() });
  }
  function addNextTimed({ entryIndex, activityIndex }: EditingActivity) {
    // After splitting "×5", the next position is already waiting for its time: go there instead of adding a sixth.
    const activities = entries[entryIndex].activities;
    if (isWaitingForTime(activities[activityIndex + 1], activities[activityIndex])) return setEditingActivity({ entryIndex, activityIndex: activityIndex + 1, focusTime: true, seq: Date.now() });
    updateEntry(entryIndex, (entry) => ({ ...entry, activities: entry.activities.flatMap((item, i) => i === activityIndex ? [item, nextTimedCopy(item)] : [item]) }));
    setEditingActivity({ entryIndex, activityIndex: activityIndex + 1, focusTime: true, seq: Date.now() });
  }
  async function save(closeAfterSave = true) {
    if (!entries.length) { setMessage('Dodaj co najmniej jedno wejście.'); return false; }
    if (entries.some((entry) => !entry.activities.length)) { setMessage('Każde wejście powinno zawierać co najmniej jedną czynność.'); return false; }
    setSaving(true);
    try {
      const input = { date, entries, rating, comment: comment.trim() || null };
      const saved = savedId ? await api.updateTraining(savedId, input) : await api.createTraining(input);
      setSavedId(saved.id); setDirty(false); setGlobalDirty(false);
      const records = recordsMessage(saved.newRecords);
      if (closeAfterSave) await onSaved(records ? `Trening został zapisany. ${records}` : undefined);
      else setMessage(records ? `Zapisano. ${records}` : 'Zapisano. Trener widzi już aktualne wejścia — możesz kontynuować trening.');
      return true;
    }
    catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Nie udało się zapisać treningu. Twoje dane pozostały w formularzu.'); }
    finally { setSaving(false); }
    return false;
  }
  async function removeTraining() {
    if (!savedId || !confirm('Usunąć ten trening? Tej operacji nie można cofnąć.')) return;
    try { await api.deleteTraining(savedId); setGlobalDirty(false); await onSaved('Trening został usunięty.'); }
    catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Nie udało się usunąć treningu.'); }
  }

  const total = useMemo(() => entries.reduce((sum, entry) => sum + entry.activities.reduce((activitySum, activity) => activitySum + activityElements(activity), 0), 0), [entries]);
  const visibleIndexes = newestEntryIndexes(entries.length, visibleEntryCount);
  const hiddenEntryCount = Math.max(0, entries.length - visibleIndexes.length);
  if (sources.loading) return <Loading/>;
  if (sources.error) return <ErrorState message={sources.error} retry={sources.reload}/>;
  const landingOptions = sources.data!.executionTypes.filter((x) => !x.hidden);
  return <div className="page editor-page">
    <PageHeader title={savedId ? 'Edytuj trening' : 'Nowy trening'} eyebrow={dirty ? 'Niezapisane zmiany' : savedId ? 'Zmiany widoczne dla trenera' : 'Dziennik'} onBack={back} action={<button className="button primary compact" onClick={() => void save(false)} disabled={saving}>{saving ? 'Zapisuję…' : 'Zapisz'}</button>}/>
    <section className="date-panel"><label>Data treningu<input type="date" value={date} onChange={(e) => { setDate(e.target.value); markDirty(); }}/></label><div><strong>{entries.length}</strong><span>wejść</span></div><div><strong>{total}</strong><span>elementów</span></div></section>
    <button className="add-entry" onClick={addEntry}><Icon name="plus"/><span><strong>Dodaj wejście</strong><small>Nowe wejście pojawi się na górze listy</small></span></button>
    {!!entries.length && <div className="entry-list-summary"><div><strong>Ostatnie wejścia</strong><small>Najnowsze są na górze · dotknij nagłówka, aby zwinąć</small></div><span>{visibleIndexes.length} z {entries.length}</span></div>}
    <div className="entries-list">
      {visibleIndexes.map((entryIndex) => {
        const entry = entries[entryIndex]; const key = entry.clientKey!; const isCollapsed = collapsed.has(key);
        const entryElements = entry.activities.reduce((sum, activity) => sum + activityElements(activity), 0);
        return <section className={`entry-card ${isCollapsed ? 'collapsed' : ''} ${editingActivity?.entryIndex === entryIndex ? 'is-editing' : ''}`} key={key}>
          <header>
            <button className="entry-toggle" aria-expanded={!isCollapsed} onClick={() => toggleEntry(key)}>
              <span className="entry-index">{entryIndex + 1}</span>
              <div><span>Wejście {entryIndex + 1}</span><h2>{elementCountLabel(entryElements)}</h2>{isCollapsed && <small className="entry-summary">{entrySummary(entry)}</small>}</div>
            </button>
            <label className="landing-chip" title="Domyślne miejsce lądowania dla nowych pozycji w tym wejściu">
              <span className="sr-only">Domyślne miejsce lądowania</span>
              <select value={entry.defaultExecutionTypeId} onChange={(e) => { const type = sources.data!.executionTypes.find((x) => x.id === e.target.value)!; updateEntry(entryIndex, (current) => ({ ...current, defaultExecutionTypeId: type.id, defaultExecutionTypeName: type.name })); }}>
                <option value="" disabled>Lądowanie</option>{landingOptions.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}
              </select>
            </label>
            <button className="icon-button collapse-button" aria-label={isCollapsed ? `Rozwiń wejście ${entryIndex + 1}` : `Zwiń wejście ${entryIndex + 1}`} aria-expanded={!isCollapsed} onClick={() => toggleEntry(key)}><Icon name="chevron"/></button>
          </header>
          {!isCollapsed && <>
            <div className="activity-list">{entry.activities.map((activity, activityIndex) => <button className="activity" key={activity.id ?? activityIndex} onClick={() => setEditingActivity({ entryIndex, activityIndex })}>
              <span className={`activity-kind ${activity.type}`}>{activity.type === 'element' ? 'E' : 'U'}</span><div><strong>{activity.type === 'element' ? activity.elementCode : activity.routineName}</strong><small>{activity.type === 'routine' ? `${activity.isFullRoutine ? 'Cały układ' : `Elementy ${activity.rangeStart}–${activity.rangeEnd}`} · ${activity.elements?.map((x) => x.code).join(' · ')}` : activity.elementName || 'Pojedynczy element'}<br/>{activity.executionTypeName}{activity.type === 'routine' && activity.elements?.some((item) => item.timeMs != null) ? ' · czasy elementów' : ''}</small></div>{activity.timeMs != null && <span className="time-badge"><Icon name="clock"/>{formatTime(activity.timeMs)}</span>}<b>{activity.repetitions}×</b><span className="chevron">›</span>
            </button>)}</div>
            {!entry.activities.length && <p className="entry-empty">Dodaj element lub fragment układu wykonany podczas tego wejścia.</p>}
            <div className="add-activity"><button onClick={() => setPicker({ entryIndex, type: 'element' })}><Icon name="spark"/> Element</button><button onClick={() => setPicker({ entryIndex, type: 'routine' })}><Icon name="routine"/> Układ lub fragment</button></div>
            <button className="danger-link remove-entry" onClick={() => removeEntry(entryIndex)}>Usuń wejście</button>
          </>}
        </section>;
      })}
    </div>
    {entries.length > 5 && <div className="entry-list-controls">
      {hiddenEntryCount > 0 && <><button onClick={() => setVisibleEntryCount((count) => Math.min(entries.length, count + 5))}>Pokaż starsze ({Math.min(5, hiddenEntryCount)})</button><button onClick={() => setVisibleEntryCount(entries.length)}>Pokaż wszystkie ({entries.length})</button></>}
      {visibleIndexes.length > 5 && <><button onClick={() => setVisibleEntryCount((count) => Math.max(5, count - 5))}>Pokaż mniej</button><button onClick={() => setVisibleEntryCount(5)}>Tylko 5 ostatnich</button></>}
    </div>}
    <section className="rating-card">
      <header><h2>Jak poszedł trening?</h2><small>Ocenę i komentarz widzisz tylko Ty. Trener ich nie widzi.</small></header>
      <div className="rating-scale" role="radiogroup" aria-label="Ocena treningu od 1 do 10">{Array.from({ length: 10 }, (_, index) => index + 1).map((value) => <button key={value} type="button" role="radio" aria-checked={rating === value} className={rating === value ? 'active' : ''} onClick={() => { setRating(rating === value ? null : value); markDirty(); }}>{value}</button>)}</div>
      <label><span>Komentarz <span className="optional">opcjonalnie</span></span><textarea rows={3} maxLength={2000} value={comment} onChange={(e) => { setComment(e.target.value); markDirty(); }} placeholder="np. dobrze się skakało, równe lądowania"/></label>
    </section>
    {savedId && <button className="delete-training" onClick={() => void removeTraining()}>Usuń trening</button>}
    <div className="sticky-save"><span><strong>{entries.length}</strong> wejść · <strong>{total}</strong> elementów</span><div><button className="button secondary" onClick={() => void save(false)} disabled={saving}>{saving ? 'Zapisywanie…' : 'Zapisz i kontynuuj'}</button><button className="button primary" onClick={() => void save(true)} disabled={saving}>{saving ? 'Zapisywanie…' : 'Zapisz i zamknij'}</button></div></div>
    {picker?.type === 'element' && <ElementPicker entryNumber={picker.entryIndex + 1} elements={sources.data!.elements} onCreated={(element) => sources.setData({ ...sources.data!, elements: [...sources.data!.elements, element] })} onPick={(element) => addElement(picker.entryIndex, element)} onClose={() => setPicker(null)}/>}
    {picker?.type === 'routine' && <RoutinePicker entryNumber={picker.entryIndex + 1} routines={sources.data!.routines} elements={sources.data!.elements} onRoutineUpdated={(updated) => sources.setData({ ...sources.data!, routines: sources.data!.routines.map((routine) => routine.id === updated.id ? updated : routine) })} onPick={(routine, start, end) => addRoutine(picker.entryIndex, routine, start, end)} onClose={() => setPicker(null)}/>}
    {editingActivity && entries[editingActivity.entryIndex]?.activities[editingActivity.activityIndex] && <ActivityEditor
      key={`${editingActivity.entryIndex}-${editingActivity.activityIndex}-${editingActivity.seq ?? 0}`}
      entryNumber={editingActivity.entryIndex + 1}
      activity={entries[editingActivity.entryIndex].activities[editingActivity.activityIndex]}
      routines={sources.data!.routines}
      executionTypes={sources.data!.executionTypes}
      focusTime={!!editingActivity.focusTime}
      onClose={() => setEditingActivity(null)}
      onDelete={() => { updateEntry(editingActivity.entryIndex, (entry) => ({ ...entry, activities: entry.activities.filter((_, i) => i !== editingActivity.activityIndex) })); setEditingActivity(null); }}
      onChange={(activity) => { updateEntry(editingActivity.entryIndex, (entry) => ({ ...entry, activities: entry.activities.map((item, i) => i === editingActivity.activityIndex ? activity : item) })); }}
      onSplit={() => splitActivity(editingActivity)}
      onAddNextTimed={() => addNextTimed(editingActivity)}
    />}
    {showExitDialog && <div className="modal-backdrop above"><section className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="exit-title"><h2 id="exit-title">Zapisać trening?</h2><p>Masz niezapisane zmiany. Możesz je zapisać, odrzucić albo zostać w formularzu.</p><div><button className="button primary" disabled={saving} onClick={() => void save()}>{saving ? 'Zapisuję…' : 'Zapisz'}</button><button className="button danger" onClick={() => { setShowExitDialog(false); setGlobalDirty(false); onBack(); }}>Odrzuć</button><button className="button secondary" onClick={() => setShowExitDialog(false)}>Zostań</button></div></section></div>}
    {message && <Toast message={message} kind={message.startsWith('Zapisano.') ? 'success' : 'error'} onClose={() => setMessage('')}/>}
  </div>;
}

function ElementPicker({ entryNumber, elements, onCreated, onPick, onClose }: { entryNumber: number; elements: ElementItem[]; onCreated: (element: ElementItem) => void; onPick: (element: ElementItem) => void; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [favorite, setFavorite] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirmCode, setConfirmCode] = useState(false);
  const [filters, setFilters] = useState(emptyElementFilters);
  const list = filterElementChoices(elements, query, filters);
  async function create(event?: FormEvent, allowNonStandardCode = false) {
    event?.preventDefault();
    if (!allowNonStandardCode && !parseElementCode(query)) { setConfirmCode(true); return; }
    setConfirmCode(false); setSaving(true); setError('');
    try { const element = await api.createElement({ code: query.trim(), name: name.trim(), favorite, hidden: false }, allowNonStandardCode); onCreated(element); setCreating(false); setName(''); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Nie udało się dodać elementu.'); }
    finally { setSaving(false); }
  }
  return <div className="modal-backdrop above"><section className="sheet picker"><PageHeader title={creating ? 'Nowy element' : 'Dodaj element'} eyebrow={`Wejście ${entryNumber}`} onBack={creating ? () => setCreating(false) : onClose}/>{creating ? <form className="form-stack" onSubmit={create}><p className="picker-return">Po zapisaniu wrócisz do wyboru elementu w tym wejściu.</p><label>Kod elementu<input autoFocus required value={query} onChange={(e) => setQuery(e.target.value)} placeholder="np. 41o"/></label><CodeHint code={query}/><label>Nazwa <span className="optional">opcjonalnie</span><input value={name} onChange={(e) => setName(e.target.value)} placeholder="np. Barani"/></label><label className="check-row"><input type="checkbox" checked={favorite} onChange={(e) => setFavorite(e.target.checked)}/><span><strong>Dodaj do ulubionych</strong></span></label>{error && <p className="form-error">{error}</p>}<button className="button primary full" disabled={saving}>{saving ? 'Dodaję…' : 'Dodaj i wróć'}</button>{confirmCode && <ConfirmDialog title="Niepoprawny kod" confirmLabel="Tak, dodaj" onCancel={() => setConfirmCode(false)} onConfirm={() => void create(undefined, true)}><NonStandardCodeText code={query}/></ConfirmDialog>}</form> : <><div className="search"><Icon name="search"/><input autoFocus placeholder="Wpisz kod lub nazwę" value={query} onChange={(e) => setQuery(e.target.value)}/></div><ElementFilterControls value={filters} onChange={setFilters}/><button className="button secondary full picker-create" onClick={() => setCreating(true)}><Icon name="plus"/> Dodaj nowy element{query ? ` „${query}”` : ''}</button><div className="pick-list">{list.map((item) => <button key={item.id} onClick={() => onPick(item)}><strong>{item.code}</strong><span>{item.name || standardElementName(item.code) || 'Bez nazwy'}</span>{item.favorite && <b>★</b>}</button>)}</div>{!list.length && <p className="picker-empty">Nie ma takiego elementu. Zmień filtry albo dodaj go tutaj bez utraty treningu.</p>}</>}</section></div>;
}

function RoutinePicker({ entryNumber, routines, elements, onRoutineUpdated, onPick, onClose }: { entryNumber: number; routines: Routine[]; elements: ElementItem[]; onRoutineUpdated: (routine: Routine) => void; onPick: (routine: Routine, start: number, end: number) => void; onClose: () => void }) {
  const [selected, setSelected] = useState<Routine>();
  const [start, setStart] = useState(1); const [end, setEnd] = useState(1);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editSlots, setEditSlots] = useState<Routine['slots']>([]);
  const [slotPicker, setSlotPicker] = useState<number | null>(null);
  const [elementQuery, setElementQuery] = useState('');
  const [filters, setFilters] = useState(emptyElementFilters);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const listedRoutines = routines.filter((routine) => `${routine.name} ${routine.slots.map((slot) => slot.code).join(' ')}`.toLocaleLowerCase('pl').includes(query.toLocaleLowerCase('pl')));
  function beginEdit() { if (!selected) return; setEditName(selected.name); setEditSlots(selected.slots.map((slot, index) => ({ ...slot, position: index + 1 }))); setEditing(true); setError(''); }
  function chooseElement(element: ElementItem) {
    if (slotPicker === null) return;
    if (editSlots.some((slot, index) => index !== slotPicker && slot.elementId === element.id) && !confirm('Ten element już występuje w układzie. Dodać go ponownie?')) return;
    const next = [...editSlots]; const slot = { elementId: element.id, position: slotPicker + 1, code: element.code, name: element.name };
    slotPicker >= next.length ? next.push(slot) : next.splice(slotPicker, 1, slot);
    setEditSlots(next.map((item, index) => ({ ...item, position: index + 1 }))); setSlotPicker(null); setElementQuery('');
  }
  function moveSlot(index: number, direction: -1 | 1) { const target = index + direction; if (target < 0 || target >= editSlots.length) return; const next = [...editSlots]; [next[index], next[target]] = [next[target], next[index]]; setEditSlots(next.map((slot, position) => ({ ...slot, position: position + 1 }))); }
  async function saveTemplate(event: FormEvent) {
    event.preventDefault(); if (!selected || !editSlots.length) return; setSaving(true); setError('');
    try { const updated = await api.updateRoutine(selected.id, { name: editName, slots: editSlots }); onRoutineUpdated(updated); setSelected(updated); setStart(1); setEnd(updated.slots.length); setEditing(false); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Nie udało się zapisać układu.'); }
    finally { setSaving(false); }
  }
  const choices = filterElementChoices(elements, elementQuery, filters);
  return <div className="modal-backdrop above"><section className="sheet picker">
    {slotPicker !== null ? <><PageHeader title="Wybierz element" eyebrow={`Edycja · ${editName}`} onBack={() => setSlotPicker(null)}/><div className="search"><Icon name="search"/><input autoFocus placeholder="Kod lub nazwa" value={elementQuery} onChange={(event) => setElementQuery(event.target.value)}/></div><ElementFilterControls value={filters} onChange={setFilters}/><div className="pick-list">{choices.map((element) => <button key={element.id} onClick={() => chooseElement(element)}><strong>{element.code}</strong><span>{element.name || 'Bez nazwy'}</span>{element.favorite && <b>★</b>}</button>)}</div>{!choices.length && <p className="picker-empty">Brak elementów pasujących do wyszukiwania i filtrów.</p>}</>
      : editing ? <><PageHeader title="Edytuj szablon" eyebrow="Zmiana nie ruszy dawnych treningów" onBack={() => setEditing(false)}/><form className="form-stack" onSubmit={saveTemplate}><label>Nazwa układu<input value={editName} onChange={(event) => setEditName(event.target.value)} required/></label><div className="field-label"><span>Elementy układu</span><small>{editSlots.length}</small></div><div className="slot-list">{editSlots.map((slot, index) => <div className="slot" key={`${slot.elementId}-${index}`}><span className="slot-number">{index + 1}</span><button type="button" className="slot-main" onClick={() => setSlotPicker(index)}><strong>{slot.code}</strong><small>{slot.name || 'Bez nazwy'}</small></button><div className="slot-actions"><button type="button" disabled={index === 0} onClick={() => moveSlot(index, -1)}>↑</button><button type="button" disabled={index === editSlots.length - 1} onClick={() => moveSlot(index, 1)}>↓</button><button type="button" onClick={() => setEditSlots(editSlots.filter((_, itemIndex) => itemIndex !== index).map((item, position) => ({ ...item, position: position + 1 })))}>×</button></div></div>)}<button type="button" className="add-slot" onClick={() => setSlotPicker(editSlots.length)}><Icon name="plus"/> Dodaj element</button></div><p className="hint">Zapis zmieni bieżący szablon i jego przyszłe użycia. Wcześniejsze treningi zachowają własne migawki.</p>{error && <p className="form-error">{error}</p>}<button className="button primary full" disabled={saving || !editSlots.length}>{saving ? 'Zapisuję…' : 'Zapisz szablon'}</button></form></>
      : !selected ? <><PageHeader title="Dodaj układ" eyebrow={`Wejście ${entryNumber}`} onBack={onClose}/><div className="search"><Icon name="search"/><input autoFocus placeholder="Nazwa lub kod w układzie" value={query} onChange={(event) => setQuery(event.target.value)}/></div><div className="pick-list routines">{listedRoutines.map((routine) => <button key={routine.id} onClick={() => { setSelected(routine); setStart(1); setEnd(routine.slots.length); }}><strong>{routine.name}</strong><span>{routine.slots.length} elementów · {routine.slots.map((slot) => slot.code).join(' · ')}</span><i>›</i></button>)}{!listedRoutines.length && <p className="picker-empty">Nie znaleziono układu.</p>}</div></>
      : <><PageHeader title="Dodaj układ" eyebrow={`Wejście ${entryNumber}`} onBack={() => setSelected(undefined)}/><div className="range-picker"><div className="template-heading"><div><span className="kicker">{selected.name}</span><h2>Wybierz zakres</h2></div><button className="button secondary compact" onClick={beginEdit}>Edytuj szablon</button></div><div className="range-fields"><label>Od<select value={start} onChange={(event) => { const value = Number(event.target.value); setStart(value); setEnd(Math.max(end, value)); }}>{selected.slots.map((_, index) => <option key={index} value={index + 1}>{index + 1}</option>)}</select></label><span>—</span><label>Do<select value={end} onChange={(event) => setEnd(Number(event.target.value))}>{selected.slots.map((_, index) => index + 1 >= start && <option key={index} value={index + 1}>{index + 1}</option>)}</select></label></div><div className="routine-preview selected">{selected.slots.slice(start - 1, end).map((slot, index) => <span key={index}><small>{start + index}</small>{slot.code}</span>)}</div><button className="button primary full" onClick={() => onPick(selected, start, end)}>{start === 1 && end === selected.slots.length ? 'Dodaj cały układ' : `Dodaj fragment ${start}–${end}`}</button></div></>}
  </section></div>;
}

/** Seconds with up to three decimals; keeps what the user typed until it is a valid time. */
function TimeField({ label, valueMs, onChange, autoFocus = false, compact = false }: { label: string; valueMs: number | null | undefined; onChange: (ms: number | null) => void; autoFocus?: boolean; compact?: boolean }) {
  const [text, setText] = useState(valueMs != null ? String(valueMs / 1000).replace('.', ',') : '');
  const parsed = parseSeconds(text);
  return <label className={`time-field ${compact ? 'compact' : ''}`}>
    <span className={compact ? 'sr-only' : ''}>{label}</span>
    <span className="time-input"><input inputMode="decimal" enterKeyHint="done" autoComplete="off" autoFocus={autoFocus} aria-label={label} aria-invalid={parsed === undefined} placeholder="np. 1,234" value={text} onChange={(event) => { setText(event.target.value); const next = parseSeconds(event.target.value); if (next !== undefined) onChange(next); }}/><i>s</i></span>
    {parsed === undefined && <small className="form-error">Wpisz sekundy, np. 1,234 (najwyżej trzy miejsca po przecinku).</small>}
  </label>;
}

function ActivityEditor({ entryNumber, activity, routines, executionTypes, focusTime, onClose, onDelete, onChange, onSplit, onAddNextTimed }: { entryNumber: number; activity: Activity; routines: Routine[]; executionTypes: ExecutionType[]; focusTime: boolean; onClose: () => void; onDelete: () => void; onChange: (activity: Activity) => void; onSplit: () => void; onAddNextTimed: () => void }) {
  const currentRoutine = activity.type === 'routine' ? routines.find((routine) => routine.id === activity.routineId) : undefined;
  const canResize = activity.type === 'routine' && currentRoutine && activity.sourceTemplateVersion != null && currentRoutine.templateVersion === activity.sourceTemplateVersion;
  const [showTime, setShowTime] = useState(activity.timeMs != null || focusTime);
  const [showElementTimes, setShowElementTimes] = useState(!!activity.elements?.some((item) => item.timeMs != null));
  const [askSplit, setAskSplit] = useState<'time' | 'elements' | null>(null);
  const timed = hasTimes(activity);
  function changeRange(start: number, end: number) {
    if (activity.type !== 'routine' || !currentRoutine || !canResize) return;
    const oldStart = activity.rangeStart ?? 1;
    const nextElements = currentRoutine.slots.slice(start - 1, end).map((slot, index) => {
      const existing = activity.elements?.[start + index - oldStart];
      if (existing && (existing.elementId === slot.elementId || existing.code === slot.code)) return existing;
      return { elementId: slot.elementId, code: slot.code ?? '—', name: slot.name, executionTypeId: activity.executionTypeId, executionTypeName: activity.executionTypeName };
    });
    onChange({ ...activity, rangeStart: start, rangeEnd: end, isFullRoutine: start === 1 && end === currentRoutine.slots.length, elements: nextElements });
  }
  // A time always belongs to one execution, so ×5 first has to become five positions.
  function requestTime(kind: 'time' | 'elements') {
    if (activity.repetitions > 1) return setAskSplit(kind);
    if (kind === 'time') setShowTime(true); else setShowElementTimes(true);
  }
  const rangeStart = activity.rangeStart ?? 1; const rangeEnd = activity.rangeEnd ?? activity.elements?.length ?? 1;
  const name = activity.type === 'element' ? activity.elementCode : activity.routineName;
  const timeLabel = activity.type === 'element' ? 'Czas wykonania' : activity.isFullRoutine ? 'Czas całego układu' : 'Czas fragmentu';
  return <div className="modal-backdrop above"><section className="sheet"><PageHeader title="Edytuj wykonanie" eyebrow={`Wejście ${entryNumber}`} onBack={onClose}/><div className="activity-editor">
    <div className="activity-title"><span className={`activity-kind ${activity.type}`}>{activity.type === 'element' ? 'E' : 'U'}</span><div><strong>{name}</strong><small>{activity.type === 'routine' ? `W tym wykonaniu: ${activity.elements?.map((item) => item.code).join(' · ')}` : activity.elementName || 'Pojedynczy element'}</small></div></div>
    <div className="field-label"><span>Liczba powtórzeń</span></div>
    <Counter value={activity.repetitions} disabled={timed} onChange={(repetitions) => onChange({ ...activity, repetitions })}/>
    {timed && <p className="hint">Pozycja z czasem to jedno wykonanie. Kolejne wykonanie na czas dodasz przyciskiem poniżej.</p>}

    <div className="time-section">
      {askSplit ? <div className="split-prompt" role="alertdialog" aria-label="Rozdzielenie powtórzeń">
        <p>Czas wpisuje się dla jednego wykonania. Rozdzielić „{name} ×{activity.repetitions}” na {activity.repetitions} osobnych pozycji ×1, każdą z własnym czasem?</p>
        <div><button className="button primary" onClick={onSplit}>Rozdziel na {activity.repetitions}</button><button className="button secondary" onClick={() => setAskSplit(null)}>Anuluj</button></div>
      </div>
      : showTime ? <div className="time-row">
        <TimeField label={timeLabel} valueMs={activity.timeMs} autoFocus={focusTime} onChange={(timeMs) => onChange({ ...activity, timeMs })}/>
        <button className="text-button" onClick={() => { onChange({ ...activity, timeMs: null }); setShowTime(false); }}>Usuń czas</button>
      </div>
      : <button className="time-add" onClick={() => requestTime('time')}><Icon name="clock"/> Dodaj czas{activity.type === 'routine' ? activity.isFullRoutine ? ' układu' : ' fragmentu' : ''}</button>}
      {activity.type === 'routine' && !askSplit && !showElementTimes && <button className="time-add" onClick={() => requestTime('elements')}><Icon name="clock"/> Dodaj czasy elementów</button>}
      {timed && activity.repetitions === 1 && <button className="button secondary full" onClick={onAddNextTimed}><Icon name="plus"/> Kolejne wykonanie na czas</button>}
    </div>

    {activity.type === 'routine' && (canResize ? <div className="routine-count-editor"><div className="field-label"><span>Wykonany fragment układu</span><small>{activity.elements?.length ?? 0} z {currentRoutine.slots.length} elementów</small></div><div className="range-fields"><label>Od<select value={rangeStart} onChange={(event) => { const value = Number(event.target.value); changeRange(value, Math.max(rangeEnd, value)); }}>{currentRoutine.slots.map((_, index) => <option key={index} value={index + 1}>{index + 1}</option>)}</select></label><span>—</span><label>Do<select value={rangeEnd} onChange={(event) => changeRange(rangeStart, Number(event.target.value))}>{currentRoutine.slots.map((_, index) => index + 1 >= rangeStart && <option key={index} value={index + 1}>{index + 1}</option>)}</select></label></div></div> : <p className="form-warning">Nie można tutaj zmienić liczby elementów, ponieważ źródłowy układ został usunięty albo od czasu tego wykonania zmieniono jego szablon. Jeśli zapis ma mieć inny skład, usuń tę czynność i dodaj wykonane elementy pojedynczo.</p>)}
    <label>Miejsce lądowania<select value={activity.executionTypeId} onChange={(event) => { const type = executionTypes.find((item) => item.id === event.target.value)!; onChange({ ...activity, executionTypeId: type.id, executionTypeName: type.name }); }}><option value="" disabled>Wybierz</option>{executionTypes.map((type) => <option value={type.id} key={type.id}>{type.name}</option>)}</select><small>{activity.type === 'routine' ? 'Dla układu to wartość startowa. Poniżej możesz zaznaczyć, że np. ostatni element był na materac, a wcześniejsze na siatkę.' : 'Domyślnie takie jak w wejściu.'}</small></label>
    {activity.type === 'routine' && <div className={`snapshot-elements ${showElementTimes ? 'with-times' : ''}`}><div className="field-label"><span>{showElementTimes ? 'Lądowanie i czas każdego elementu' : 'Gdzie lądował każdy element?'}</span></div>{activity.elements?.map((element, index) => <div key={index}><strong>{(activity.rangeStart ?? 1) + index}. {element.code}</strong><select aria-label={`Lądowanie elementu ${index + 1}: ${element.code}`} value={element.executionTypeId} onChange={(event) => { const type = executionTypes.find((item) => item.id === event.target.value)!; onChange({ ...activity, elements: activity.elements!.map((item, itemIndex) => itemIndex === index ? { ...item, executionTypeId: type.id, executionTypeName: type.name } : item) }); }}>{executionTypes.map((type) => <option value={type.id} key={type.id}>{type.name}</option>)}</select>{showElementTimes && <TimeField compact label={`Czas elementu ${index + 1}: ${element.code}`} valueMs={element.timeMs} onChange={(timeMs) => onChange({ ...activity, elements: activity.elements!.map((item, itemIndex) => itemIndex === index ? { ...item, timeMs } : item) })}/>}</div>)}
      {showElementTimes && <button className="text-button" onClick={() => { onChange({ ...activity, elements: activity.elements?.map((item) => ({ ...item, timeMs: null })) }); setShowElementTimes(false); }}>Usuń czasy elementów</button>}
    </div>}
    <button className="button secondary full" onClick={onClose}>Gotowe</button><button className="danger-link centered" onClick={onDelete}>Usuń tę czynność</button>
  </div></section></div>;
}
