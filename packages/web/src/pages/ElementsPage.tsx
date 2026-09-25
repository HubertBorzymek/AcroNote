import { FormEvent, useMemo, useState } from 'react';
import { api } from '../api';
import { useAsync, useUnsavedChanges } from '../hooks';
import type { ElementItem } from '../types';
import { EmptyState, ErrorState, Icon, Loading, PageHeader, Toast } from '../components/ui';
import { formatTwists, parseElementCode, type BodyPosition } from '../elementCode';

const blank: Omit<ElementItem, 'id'> = { code: '', name: '', favorite: false, hidden: false };

export function ElementsPage({ setDirty }: { setDirty: (dirty: boolean) => void }) {
  const result = useAsync(() => api.elements(true), []);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'active' | 'favorite' | 'hidden'>('active');
  const [somersaults, setSomersaults] = useState('all');
  const [twists, setTwists] = useState('all');
  const [direction, setDirection] = useState('all');
  const [position, setPosition] = useState<'all' | BodyPosition>('all');
  const [showHelp, setShowHelp] = useState(false);
  const [editing, setEditing] = useState<ElementItem | 'new' | null>(null);
  const [form, setForm] = useState(blank);
  const [dirty, setLocalDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  useUnsavedChanges(dirty);

  const markDirty = (value: boolean) => { setLocalDirty(value); setDirty(value); };
  const filtered = useMemo(() => (result.data ?? []).filter((item) => {
    const matches = `${item.code} ${item.name ?? ''}`.toLocaleLowerCase('pl').includes(query.toLocaleLowerCase('pl'));
    const parsed = parseElementCode(item.code);
    const category = filter === 'favorite' ? item.favorite && !item.hidden : filter === 'hidden' ? item.hidden : !item.hidden;
    return matches && category
      && (somersaults === 'all' || parsed?.somersaults === Number(somersaults))
      && (twists === 'all' || parsed?.totalTwists === Number(twists))
      && (direction === 'all' || parsed?.direction === direction)
      && (position === 'all' || parsed?.position === position);
  }), [result.data, query, filter, somersaults, twists, direction, position]);

  function open(item: ElementItem | 'new') {
    setEditing(item); setForm(item === 'new' ? blank : { code: item.code, name: item.name ?? '', favorite: item.favorite, hidden: item.hidden }); markDirty(false);
  }
  function close() {
    if (dirty && !window.confirm('Masz niezapisane zmiany. Czy na pewno chcesz je odrzucić?')) return;
    setEditing(null); markDirty(false);
  }
  async function save(event: FormEvent) {
    event.preventDefault(); setSaving(true);
    try {
      editing === 'new' ? await api.createElement(form) : editing && await api.updateElement(editing.id, form);
      await result.reload(); setEditing(null); markDirty(false); setMessage('Element został zapisany.');
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Nie udało się zapisać elementu.'); }
    finally { setSaving(false); }
  }
  async function toggle(item: ElementItem, field: 'favorite' | 'hidden') {
    try { await api.updateElement(item.id, { code: item.code, name: item.name, favorite: field === 'favorite' ? !item.favorite : item.favorite, hidden: field === 'hidden' ? !item.hidden : item.hidden }); await result.reload(); setMessage(field === 'hidden' ? (item.hidden ? 'Element został przywrócony.' : 'Element został ukryty.') : 'Zapisano zmianę.'); }
    catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Nie udało się zapisać zmiany.'); }
  }
  async function remove(item: ElementItem) {
    try {
      const usage = await api.elementUsage(item.id);
      let removeFromRoutines = false;
      if (usage.routineCount > 0) removeFromRoutines = window.confirm(`Ten element jest w ${usage.routineCount} ${usage.routineCount === 1 ? 'układzie' : 'układach'}.\n\nOK — usuń go także z tych układów\nAnuluj — zostaw jego zapis w układach`);
      if (!window.confirm(`Usunąć element ${item.code} z Twojej listy? Historia treningów pozostanie bez zmian.`)) return;
      await api.deleteElement(item.id, removeFromRoutines); await result.reload(); setMessage('Element usunięto z listy. Historia nie została zmieniona.');
    }
    catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Nie udało się usunąć elementu.'); }
  }

  if (result.loading) return <Loading/>;
  if (result.error) return <ErrorState message={result.error} retry={result.reload}/>;
  return <div className="page">
    <PageHeader title="Moje elementy" eyebrow={`${result.data?.filter((x) => !x.hidden).length ?? 0} aktywnych`} action={<button className="button primary compact" onClick={() => open('new')}><Icon name="plus"/> Dodaj</button>}/>
    <div className="search"><Icon name="search"/><input aria-label="Szukaj elementów" placeholder="Szukaj po kodzie lub nazwie" value={query} onChange={(e) => setQuery(e.target.value)}/>{query && <button onClick={() => setQuery('')} aria-label="Wyczyść">×</button>}</div>
    <div className="filter-row">
      {([['active', 'Wszystkie'], ['favorite', 'Ulubione'], ['hidden', 'Ukryte']] as const).map(([key, label]) => <button className={filter === key ? 'active' : ''} onClick={() => setFilter(key)} key={key}>{label}</button>)}
    </div>
    <div className="element-tools"><select aria-label="Liczba salt" value={somersaults} onChange={(e) => setSomersaults(e.target.value)}><option value="all">Wszystkie salta</option>{[1,2,3].map((x) => <option key={x} value={x}>{x} {x === 1 ? 'salto' : 'salta'}</option>)}</select><select aria-label="Suma śrub" value={twists} onChange={(e) => setTwists(e.target.value)}><option value="all">Wszystkie śruby</option>{Array.from({ length: 7 }, (_, i) => i / 2).map((x) => <option key={x} value={x}>{formatTwists(x)} śruby</option>)}</select><select aria-label="Kierunek" value={direction} onChange={(e) => setDirection(e.target.value)}><option value="all">Przód i tył</option><option>Przód</option><option>Tył</option></select><select aria-label="Pozycja" value={position} onChange={(e) => setPosition(e.target.value as typeof position)}><option value="all">Każda pozycja</option><option value="o">Kuczna (o)</option><option value="<">Łamana (&lt;)</option><option value="/">Prosta (/)</option></select><button onClick={() => setShowHelp(!showHelp)}>{showHelp ? 'Ukryj ściągawkę' : 'Jak czytać kod?'}</button></div>
    {showHelp && <section className="code-help"><h2>Ściągawka kodów</h2><div><article><strong>1. Salta</strong><p>Pierwsza liczba mówi o ćwiartkach salta: <b>4</b> = 1 salto, <b>8</b> = 2, <b>12</b> = 3.</p></article><article><strong>2. Śruby</strong><p>Każda kolejna cyfra to pół śruby w danym salcie. <b>831</b> oznacza 1,5 śruby i potem 0,5.</p></article><article><strong>3. Pozycja</strong><p>Ostatni znak: <b>o</b> kuczna, <b>&lt;</b> łamana, <b>/</b> prosta.</p></article></div><p className="hint">Przykład: <b>800/</b> to dwa salta bez śrub w pozycji prostej.</p></section>}
    {filtered.length === 0 ? <EmptyState icon="✦" title={filter === 'hidden' && !query ? 'Nie masz ukrytych elementów' : query || somersaults !== 'all' || twists !== 'all' || direction !== 'all' || position !== 'all' ? 'Brak wyników' : 'Tu pojawią się Twoje elementy'} description={filter === 'hidden' && !query ? 'Ukryte elementy nie pokazują się podczas układania treningu. Gdy coś ukryjesz, możesz to tutaj przywrócić.' : query ? 'Spróbuj zmienić wyszukiwanie lub filtry.' : 'Dodaj pierwszy kod, aby użyć go w treningu i układach.'} action={filter !== 'hidden' && !query && <button className="button primary" onClick={() => open('new')}>Dodaj pierwszy element</button>}/>
      : <div className="element-grid">{filtered.map((item) => <article className={`element-card ${item.hidden ? 'muted' : ''}`} key={item.id}>
        <button className={`favorite ${item.favorite ? 'active' : ''}`} aria-label={item.favorite ? 'Usuń z ulubionych' : 'Dodaj do ulubionych'} onClick={() => void toggle(item, 'favorite')}>★</button>
        <button className="element-main" onClick={() => open(item)}><strong>{item.code}</strong><span>{item.name || 'Bez nazwy własnej'}</span></button>
        <div className="card-actions"><button onClick={() => open(item)}>Edytuj</button><button onClick={() => void toggle(item, 'hidden')}>{item.hidden ? 'Przywróć' : 'Ukryj'}</button><button className="danger-link" onClick={() => void remove(item)}>Usuń</button></div>
      </article>)}</div>}

    {editing && <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}><section className="sheet" role="dialog" aria-modal="true">
      <PageHeader title={editing === 'new' ? 'Nowy element' : 'Edytuj element'} onBack={close}/>
      <form onSubmit={save} className="form-stack">
        <label>Kod elementu<input autoFocus value={form.code} onChange={(e) => { setForm({ ...form, code: e.target.value }); markDirty(true); }} required placeholder="np. 41o"/></label>
        <label>Nazwa własna <span className="optional">opcjonalnie</span><input value={form.name ?? ''} onChange={(e) => { setForm({ ...form, name: e.target.value }); markDirty(true); }} placeholder="np. Barani"/></label>
        <label className="check-row"><input type="checkbox" checked={form.favorite} onChange={(e) => { setForm({ ...form, favorite: e.target.checked }); markDirty(true); }}/><span><strong>Dodaj do ulubionych</strong><small>Element będzie łatwo dostępny podczas treningu.</small></span></label>
        {form.code && parseElementCode(form.code) ? <p className="hint">{(() => { const code = parseElementCode(form.code)!; return `${code.somersaults} ${code.somersaults === 1 ? 'salto' : 'salta'} · ${formatTwists(code.totalTwists)} śruby · ${code.direction.toLowerCase()} · ${code.positionName.toLowerCase()}`; })()}</p> : <p className="hint">Kod musi kończyć się pozycją: <b>o</b>, <b>&lt;</b> lub <b>/</b>. Liczba cyfr śrub powinna być taka sama jak liczba salt.</p>}
        <div className="sheet-actions"><button type="button" className="button secondary" onClick={close}>Anuluj</button><button className="button primary" disabled={saving}>{saving ? 'Zapisywanie…' : 'Zapisz element'}</button></div>
      </form>
    </section></div>}
    {message && <Toast message={message} kind={message.includes('Nie udało') ? 'error' : 'success'} onClose={() => setMessage('')}/>} 
  </div>;
}
