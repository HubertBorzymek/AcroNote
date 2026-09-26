import { FormEvent, useMemo, useState } from 'react';
import { api } from '../api';
import { useAsync, useUnsavedChanges } from '../hooks';
import type { Routine, RoutineSlot } from '../types';
import { EmptyState, ErrorState, Icon, Loading, PageHeader, Toast } from '../components/ui';
import { ElementFilterControls, emptyElementFilters, filterElementChoices } from '../elementFilters';

export function RoutinesPage({ setDirty }: { setDirty: (dirty: boolean) => void }) {
  const routines = useAsync(api.routines, []);
  const elements = useAsync(() => api.elements(false), []);
  const [editing, setEditing] = useState<Routine | 'new' | null>(null);
  const [name, setName] = useState('');
  const [slots, setSlots] = useState<RoutineSlot[]>([]);
  const [picker, setPicker] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [pickerFilters, setPickerFilters] = useState(emptyElementFilters);
  const [dirty, setLocalDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  useUnsavedChanges(dirty);
  const markDirty = (value: boolean) => { setLocalDirty(value); setDirty(value); };

  const duplicateIds = useMemo(() => {
    const counts = slots.reduce<Record<string, number>>((all, slot) => ({ ...all, [slot.elementId]: (all[slot.elementId] ?? 0) + 1 }), {});
    return new Set(Object.entries(counts).filter(([, count]) => count > 1).map(([id]) => id));
  }, [slots]);

  function open(item: Routine | 'new') {
    setEditing(item); setName(item === 'new' ? '' : item.name);
    setSlots(item === 'new' ? [] : item.slots.map((slot, index) => ({ ...slot, position: index + 1 })));
    markDirty(false);
  }
  function close() {
    if (dirty && !confirm('Masz niezapisane zmiany w układzie. Czy chcesz je odrzucić?')) return;
    setEditing(null); setPicker(null); markDirty(false);
  }
  function selectElement(elementId: string) {
    if (picker === null) return;
    if (slots.some((slot) => slot.elementId === elementId) && !confirm('Ten element już występuje w układzie. Dodać go ponownie?')) return;
    const element = elements.data?.find((item) => item.id === elementId);
    const next = [...slots];
    const slot = { elementId, position: picker + 1, code: element?.code, name: element?.name };
    picker >= next.length ? next.push(slot) : next.splice(picker, 1, slot);
    setSlots(next.map((item, index) => ({ ...item, position: index + 1 }))); setPicker(null); setQuery(''); markDirty(true);
  }
  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= slots.length) return;
    const next = [...slots]; [next[index], next[target]] = [next[target], next[index]];
    setSlots(next.map((slot, position) => ({ ...slot, position: position + 1 }))); markDirty(true);
  }
  async function save(event: FormEvent) {
    event.preventDefault(); setSaving(true);
    try {
      const input = { name, slots: slots.map(({ elementId, position }) => ({ elementId, position })) };
      editing === 'new' ? await api.createRoutine(input) : editing && await api.updateRoutine(editing.id, input);
      await routines.reload(); setEditing(null); markDirty(false); setMessage('Układ został zapisany. Poprzednie treningi zachowują własne migawki.');
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Nie udało się zapisać układu.'); }
    finally { setSaving(false); }
  }
  async function remove(item: Routine) {
    if (!confirm(`Usunąć aktualny układ „${item.name}”? Historyczne wykonania pozostaną bez zmian.`)) return;
    try { await api.deleteRoutine(item.id); await routines.reload(); setMessage('Układ usunięto. Historia treningów pozostała bez zmian.'); }
    catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Nie udało się usunąć układu.'); }
  }

  if (routines.loading || elements.loading) return <Loading/>;
  if (routines.error || elements.error) return <ErrorState message={routines.error || elements.error} retry={() => void Promise.all([routines.reload(), elements.reload()])}/>;
  return <div className="page">
    <PageHeader title="Moje układy" eyebrow={`${routines.data?.length ?? 0} zapisanych`} action={<button className="button primary compact" onClick={() => open('new')}><Icon name="plus"/> Dodaj</button>}/>
    {!routines.data?.length ? <EmptyState icon="≋" title="Stwórz pierwszy układ" description="Ułóż elementy w kolejności. Późniejsze zmiany nie wpłyną na historię treningów." action={<button className="button primary" onClick={() => open('new')}>Utwórz układ</button>}/>
      : <div className="routine-list">{routines.data.map((routine) => <article className="routine-card" key={routine.id}>
        <div className="routine-heading"><div><span>Układ</span><h2>{routine.name}</h2></div><button className="icon-button" aria-label="Edytuj układ" onClick={() => open(routine)}><Icon name="more"/></button></div>
        <div className="routine-preview">{routine.slots.map((slot, index) => <span key={slot.id ?? `${slot.elementId}-${index}`}><small>{index + 1}</small>{slot.code ?? elements.data?.find((x) => x.id === slot.elementId)?.code ?? '—'}</span>)}</div>
        <footer><span>{routine.slots.length} {routine.slots.length === 1 ? 'element' : 'elementów'}</span><button onClick={() => open(routine)}>Edytuj</button><button className="danger-link" onClick={() => void remove(routine)}>Usuń</button></footer>
      </article>)}</div>}

    {editing && <div className="modal-backdrop"><section className="sheet wide" role="dialog" aria-modal="true">
      <PageHeader title={editing === 'new' ? 'Nowy układ' : 'Edytuj układ'} onBack={close}/>
      <form onSubmit={save} className="form-stack">
        <label>Nazwa układu<input value={name} onChange={(e) => { setName(e.target.value); markDirty(true); }} required placeholder="np. Układ 1" autoFocus/></label>
        <div className="field-label"><span>Elementy układu</span><small>{slots.length} / dowolna liczba</small></div>
        <div className="slot-list">
          {slots.map((slot, index) => <div className={`slot ${duplicateIds.has(slot.elementId) ? 'duplicate' : ''}`} key={`${slot.elementId}-${index}`}>
            <span className="slot-number">{index + 1}</span><button type="button" className="slot-main" onClick={() => setPicker(index)}><strong>{slot.code ?? elements.data?.find((x) => x.id === slot.elementId)?.code}</strong><small>{slot.name ?? elements.data?.find((x) => x.id === slot.elementId)?.name ?? 'Bez nazwy'}</small></button>
            {duplicateIds.has(slot.elementId) && <span className="duplicate-tag">powtórzenie</span>}
            <div className="slot-actions"><button type="button" disabled={index === 0} onClick={() => move(index, -1)} aria-label="Przesuń w górę">↑</button><button type="button" disabled={index === slots.length - 1} onClick={() => move(index, 1)} aria-label="Przesuń w dół">↓</button><button type="button" onClick={() => { setSlots(slots.filter((_, i) => i !== index).map((x, i) => ({ ...x, position: i + 1 }))); markDirty(true); }} aria-label="Usuń">×</button></div>
          </div>)}
          <button type="button" className="add-slot" onClick={() => setPicker(slots.length)}><Icon name="plus"/> Dodaj element na pozycji {slots.length + 1}</button>
        </div>
        <p className="hint">Każde wykonanie układu otrzyma osobną migawkę kodów. Edycja tego szablonu nie zmieni wcześniejszych treningów.</p>
        <div className="sheet-actions"><button type="button" className="button secondary" onClick={close}>Anuluj</button><button className="button primary" disabled={saving || slots.length === 0}>{saving ? 'Zapisywanie…' : 'Zapisz układ'}</button></div>
      </form>
    </section></div>}
    {picker !== null && <div className="modal-backdrop above"><section className="sheet picker"><PageHeader title="Wybierz element" onBack={() => setPicker(null)}/><div className="search"><Icon name="search"/><input autoFocus placeholder="Kod lub nazwa" value={query} onChange={(e) => setQuery(e.target.value)}/></div><ElementFilterControls value={pickerFilters} onChange={setPickerFilters}/><div className="pick-list">{filterElementChoices(elements.data ?? [], query, pickerFilters).map((item) => <button key={item.id} onClick={() => selectElement(item.id)}><strong>{item.code}</strong><span>{item.name || 'Bez nazwy'}</span>{item.favorite && <b>★</b>}</button>)}</div>{!filterElementChoices(elements.data ?? [], query, pickerFilters).length && <p className="picker-empty">Brak elementów pasujących do wyszukiwania i filtrów.</p>}</section></div>}
    {message && <Toast message={message} kind={message.startsWith('Nie') ? 'error' : 'success'} onClose={() => setMessage('')}/>} 
  </div>;
}
