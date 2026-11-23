import { FormEvent, useMemo, useState } from 'react';
import { api } from '../api';
import { useAsync, useUnsavedChanges } from '../hooks';
import type { Apparatus, ElementItem } from '../types';
import { CodeHint, ConfirmDialog, EmptyState, ErrorState, Icon, Loading, NonStandardCodeText, PageHeader, Toast } from '../components/ui';
import { catalogNames, parseCatalogCode, type Catalog } from '../elementCode';
import { catalogOf, elementLabel, elementMatches, ElementFilterSelects, emptyElementFilters } from '../elementFilters';

const blank: Omit<ElementItem, 'id'> = { code: '', name: '', favorite: false, hidden: false };
const STORED_CATALOG = 'acronote.elements.catalog';
const readStored = () => { try { return localStorage.getItem(STORED_CATALOG); } catch { return null; } };
const store = (value: Catalog) => { try { localStorage.setItem(STORED_CATALOG, value); } catch { /* not remembered */ } };

/** Catalogs worth a tab: those of visible apparatus and those that already hold elements. */
export function availableCatalogs(apparatus: Apparatus[], elements: ElementItem[]): Catalog[] {
  const used = new Set<Catalog>([...apparatus.filter((item) => !item.hidden).map((item) => item.catalog), ...elements.map(catalogOf)]);
  return (['trampoline', 'tumbling'] as const).filter((catalog) => used.has(catalog));
}

export function ElementsPage({ setDirty }: { setDirty: (dirty: boolean) => void }) {
  const result = useAsync(() => api.elements(true), []);
  const apparatus = useAsync(() => api.apparatus().catch(() => [] as Apparatus[]), []);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'active' | 'favorite' | 'hidden'>('active');
  const [codeFilters, setCodeFilters] = useState(emptyElementFilters);
  const [chosenCatalog, setChosenCatalog] = useState<Catalog | null>(() => readStored() as Catalog | null);
  const [showHelp, setShowHelp] = useState(false);
  const [editing, setEditing] = useState<ElementItem | 'new' | null>(null);
  const [form, setForm] = useState(blank);
  const [dirty, setLocalDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [confirmCode, setConfirmCode] = useState(false);
  useUnsavedChanges(dirty);

  const catalogs = availableCatalogs(apparatus.data ?? [], result.data ?? []);
  const defaultCatalog = (apparatus.data ?? []).find((item) => !item.hidden)?.catalog ?? 'trampoline';
  const catalog: Catalog = chosenCatalog && catalogs.includes(chosenCatalog) ? chosenCatalog : catalogs.includes(defaultCatalog) ? defaultCatalog : catalogs[0] ?? 'trampoline';
  const formCatalog: Catalog = editing && editing !== 'new' ? catalogOf(editing) : catalog;
  const markDirty = (value: boolean) => { setLocalDirty(value); setDirty(value); };
  const inCatalog = useMemo(() => (result.data ?? []).filter((item) => catalogOf(item) === catalog), [result.data, catalog]);
  const filtered = useMemo(() => inCatalog.filter((item) => {
    const category = filter === 'favorite' ? item.favorite && !item.hidden : filter === 'hidden' ? item.hidden : !item.hidden;
    return category && elementMatches(item, query, { ...codeFilters, favoriteOnly: false });
  }), [inCatalog, query, filter, codeFilters]);
  const codeFiltered = codeFilters.somersaults !== 'all' || codeFilters.twists !== 'all' || codeFilters.direction !== 'all' || codeFilters.position !== 'all';

  function chooseCatalog(value: Catalog) { setChosenCatalog(value); store(value); setCodeFilters(emptyElementFilters); }
  function open(item: ElementItem | 'new') {
    setEditing(item); setForm(item === 'new' ? blank : { code: item.code, name: item.name ?? '', favorite: item.favorite, hidden: item.hidden }); markDirty(false);
  }
  function close() {
    if (dirty && !window.confirm('Masz niezapisane zmiany. Czy na pewno chcesz je odrzucić?')) return;
    setEditing(null); markDirty(false);
  }
  async function save(event?: FormEvent, allowNonStandardCode = false) {
    event?.preventDefault();
    // An unchanged saved code was already confirmed once.
    const unchanged = editing !== 'new' && editing?.code === form.code.trim();
    if (!allowNonStandardCode && !unchanged && !parseCatalogCode(form.code, formCatalog)) { setConfirmCode(true); return; }
    setConfirmCode(false); setSaving(true);
    try {
      editing === 'new' ? await api.createElement({ ...form, catalog: formCatalog }, allowNonStandardCode) : editing && await api.updateElement(editing.id, form, allowNonStandardCode);
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

  if (result.loading || apparatus.loading) return <Loading/>;
  if (result.error) return <ErrorState message={result.error} retry={result.reload}/>;
  return <div className="page">
    <PageHeader title="Moje elementy" eyebrow={`${inCatalog.filter((x) => !x.hidden).length} aktywnych${catalogs.length > 1 ? ` · ${catalogNames[catalog]}` : ''}`} action={<button className="button primary compact" onClick={() => open('new')}><Icon name="plus"/> Dodaj</button>}/>
    {catalogs.length > 1 && <div className="filter-row catalog-switch" role="group" aria-label="Zapis elementów">{catalogs.map((item) => <button key={item} className={catalog === item ? 'active' : ''} aria-pressed={catalog === item} onClick={() => chooseCatalog(item)}>{catalogNames[item]}</button>)}</div>}
    <div className="search"><Icon name="search"/><input aria-label="Szukaj elementów" placeholder="Szukaj po kodzie lub nazwie" value={query} onChange={(e) => setQuery(e.target.value)}/>{query && <button onClick={() => setQuery('')} aria-label="Wyczyść">×</button>}</div>
    <div className="filter-row">
      {([['active', 'Wszystkie'], ['favorite', 'Ulubione'], ['hidden', 'Ukryte']] as const).map(([key, label]) => <button className={filter === key ? 'active' : ''} onClick={() => setFilter(key)} key={key}>{label}</button>)}
    </div>
    <div className="element-tools"><ElementFilterSelects value={codeFilters} onChange={setCodeFilters} catalog={catalog}/><button onClick={() => setShowHelp(!showHelp)}>{showHelp ? 'Ukryj ściągawkę' : 'Jak czytać kod?'}</button></div>
    {showHelp && (catalog === 'tumbling' ? <TumblingHelp/> : <TrampolineHelp/>)}
    {filtered.length === 0 ? <EmptyState icon="spark" title={filter === 'hidden' && !query ? 'Nie masz ukrytych elementów' : query || codeFiltered ? 'Brak wyników' : 'Tu pojawią się Twoje elementy'} description={filter === 'hidden' && !query ? 'Ukryte elementy nie pokazują się podczas układania treningu. Gdy coś ukryjesz, możesz to tutaj przywrócić.' : query ? 'Spróbuj zmienić wyszukiwanie lub filtry.' : catalog === 'tumbling' ? 'Dodaj pierwszy element ścieżkowy, np. 0o albo rundak (.' : 'Dodaj pierwszy kod, aby użyć go w treningu i układach.'} action={filter !== 'hidden' && !query && <button className="button primary" onClick={() => open('new')}>Dodaj pierwszy element</button>}/>
      : <div className="element-grid">{filtered.map((item) => <article className={`element-card ${item.hidden ? 'muted' : ''}`} key={item.id}>
        <button className={`favorite ${item.favorite ? 'active' : ''}`} aria-label={item.favorite ? 'Usuń z ulubionych' : 'Dodaj do ulubionych'} onClick={() => void toggle(item, 'favorite')}>★</button>
        <button className="element-main" onClick={() => open(item)}><strong>{item.code}</strong><span>{elementLabel(item, 'Bez nazwy własnej')}</span>{!parseCatalogCode(item.code, catalogOf(item)) && <small className="code-flag">kod spoza notacji</small>}</button>
        <div className="card-actions"><button onClick={() => open(item)}>Edytuj</button><button onClick={() => void toggle(item, 'hidden')}>{item.hidden ? 'Przywróć' : 'Ukryj'}</button><button className="danger-link" onClick={() => void remove(item)}>Usuń</button></div>
      </article>)}</div>}

    {editing && <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}><section className="sheet" role="dialog" aria-modal="true">
      <PageHeader title={editing === 'new' ? 'Nowy element' : 'Edytuj element'} eyebrow={catalogs.length > 1 || formCatalog === 'tumbling' ? `Zapis: ${catalogNames[formCatalog]}` : undefined} onBack={close}/>
      <form onSubmit={save} className="form-stack">
        <label>Kod elementu<input autoFocus value={form.code} onChange={(e) => { setForm({ ...form, code: e.target.value }); markDirty(true); }} required placeholder={formCatalog === 'tumbling' ? 'np. 00/' : 'np. 41o'}/></label>
        <label>Nazwa własna <span className="optional">opcjonalnie</span><input value={form.name ?? ''} onChange={(e) => { setForm({ ...form, name: e.target.value }); markDirty(true); }} placeholder={formCatalog === 'tumbling' ? 'np. Podwójne proste' : 'np. Barani'}/></label>
        <label className="check-row"><input type="checkbox" checked={form.favorite} onChange={(e) => { setForm({ ...form, favorite: e.target.checked }); markDirty(true); }}/><span><strong>Dodaj do ulubionych</strong><small>Element będzie łatwo dostępny podczas treningu.</small></span></label>
        <CodeHint code={form.code} catalog={formCatalog}/>
        <div className="sheet-actions"><button type="button" className="button secondary" onClick={close}>Anuluj</button><button className="button primary" disabled={saving}>{saving ? 'Zapisywanie…' : 'Zapisz element'}</button></div>
      </form>
    </section></div>}
    {confirmCode && <ConfirmDialog title="Niepoprawny kod" confirmLabel="Tak, dodaj" onCancel={() => setConfirmCode(false)} onConfirm={() => void save(undefined, true)}><NonStandardCodeText code={form.code} catalog={formCatalog}/></ConfirmDialog>}
    {message && <Toast message={message} kind={message.includes('Nie udało') || message.startsWith('Kod') || message.startsWith('Element o tym') || message.startsWith('Elementu nie') ? 'error' : 'success'} onClose={() => setMessage('')}/>}
  </div>;
}

function TrampolineHelp() {
  return <section className="code-help"><h2>Ściągawka: trampolina i DMT</h2><div><article><strong>1. Salta</strong><p>Pierwsza liczba mówi o ćwiartkach salta: <b>4</b> = 1 salto, <b>8</b> = 2, <b>12</b> = 3.</p></article><article><strong>2. Śruby</strong><p>Każda kolejna cyfra to pół śruby w danym salcie. <b>831</b> oznacza 1,5 śruby i potem 0,5.</p></article><article><strong>3. Pozycja</strong><p>Ostatni znak: <b>o</b> kuczna, <b>&lt;</b> łamana, <b>/</b> prosta.</p></article></div><p className="hint">Przykład: <b>800/</b> to dwa salta bez śrub w pozycji prostej. Sam znak to element bez salta: <b>o</b> kuczka, <b>&lt;</b> rozkroczka, <b>/</b> poziomka.</p></section>;
}

function TumblingHelp() {
  return <section className="code-help"><h2>Ściągawka: ścieżka</h2><div><article><strong>1. Salta i śruby</strong><p>Każda cyfra to jedno salto, a jej wartość to półśruby w tym salcie: <b>0</b> bez śruby, <b>1</b> pół, <b>2</b> cała. <b>22</b> to dwa salta, w każdym cała śruba.</p></article><article><strong>2. Kierunek</strong><p>Bez kropki: w tył (<b>0o</b>, <b>00/</b>). Kropka z przodu: w przód (<b>.0o</b>, <b>.1</b>). Kropka po cyfrze: w tył ze śrubą (<b>1.</b>, <b>2.</b>). <b>x</b> na końcu: bokiem (<b>0ox</b>).</p></article><article><strong>3. Pozycja</strong><p><b>o</b> kuczna, <b>&lt;</b> łamana, <b>/</b> prosta. Przy elemencie ze śrubą można ją pominąć.</p></article></div><p className="hint">Elementy bez salta: <b>(</b> rundak, <b>F</b> flik, <b>H</b> przerzut w przód, <b>X</b> przerzut bokiem, <b>^</b> tempo. Przykład: <b>00/</b> to podwójne salto w tył proste.</p></section>;
}
