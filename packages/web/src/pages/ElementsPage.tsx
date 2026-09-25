import { FormEvent, useMemo, useState } from 'react';
import { api } from '../api';
import { useAsync, useUnsavedChanges } from '../hooks';
import type { ElementItem } from '../types';
import { EmptyState, ErrorState, Icon, Loading, PageHeader, Toast } from '../components/ui';

const blank: Omit<ElementItem, 'id'> = { code: '', name: '', favorite: false, hidden: false };

export function ElementsPage({ setDirty }: { setDirty: (dirty: boolean) => void }) {
  const result = useAsync(() => api.elements(true), []);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'active' | 'favorite' | 'hidden'>('active');
  const [editing, setEditing] = useState<ElementItem | 'new' | null>(null);
  const [form, setForm] = useState(blank);
  const [dirty, setLocalDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  useUnsavedChanges(dirty);

  const markDirty = (value: boolean) => { setLocalDirty(value); setDirty(value); };
  const filtered = useMemo(() => (result.data ?? []).filter((item) => {
    const matches = `${item.code} ${item.name ?? ''}`.toLocaleLowerCase('pl').includes(query.toLocaleLowerCase('pl'));
    return matches && (filter === 'favorite' ? item.favorite && !item.hidden : filter === 'hidden' ? item.hidden : !item.hidden);
  }), [result.data, query, filter]);

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
    try { await api.updateElement(item.id, { [field]: !item[field] }); await result.reload(); }
    catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Nie udało się zapisać zmiany.'); }
  }
  async function remove(item: ElementItem) {
    const removeFromRoutines = window.confirm('Czy usunąć ten element również z aktualnych układów?\n\nOK — usuń z układów\nAnuluj — zachowaj w układach i historii');
    if (!window.confirm(`Usunąć element ${item.code} z Twojej listy? Historia treningów pozostanie bez zmian.`)) return;
    try { await api.deleteElement(item.id, removeFromRoutines); await result.reload(); setMessage('Element usunięto z listy. Historia nie została zmieniona.'); }
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
    {filtered.length === 0 ? <EmptyState icon="✦" title={query ? 'Brak wyników' : 'Tu pojawią się Twoje elementy'} description={query ? 'Spróbuj wpisać inny kod lub nazwę.' : 'Dodaj pierwszy kod, aby użyć go w treningu i układach.'} action={!query && <button className="button primary" onClick={() => open('new')}>Dodaj pierwszy element</button>}/>
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
        <p className="hint">Kod zapisujemy dokładnie tak, jak go wpiszesz. AcroNote nie interpretuje automatycznie jego znaczenia.</p>
        <div className="sheet-actions"><button type="button" className="button secondary" onClick={close}>Anuluj</button><button className="button primary" disabled={saving}>{saving ? 'Zapisywanie…' : 'Zapisz element'}</button></div>
      </form>
    </section></div>}
    {message && <Toast message={message} kind={message.includes('Nie udało') ? 'error' : 'success'} onClose={() => setMessage('')}/>} 
  </div>;
}
