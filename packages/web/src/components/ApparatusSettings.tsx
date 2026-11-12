import { FormEvent, useState } from 'react';
import { api } from '../api';
import { useAsync } from '../hooks';
import type { Apparatus } from '../types';

export const catalogLabel = (catalog: Apparatus['catalog']) => catalog === 'tumbling' ? 'zapis ścieżkowy' : 'zapis trampolinowy';

/** "Na czym skaczę": edited like the landing places; the notation is chosen once, when adding. */
export function ApparatusSettings({ onMessage }: { onMessage: (message: string, error?: boolean) => void }) {
  const list = useAsync(api.apparatus, []);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [tracksTime, setTracksTime] = useState(false);
  const [saving, setSaving] = useState(false);
  const items = list.data ?? [];

  async function run(action: () => Promise<unknown>, success: string) {
    try { await action(); await list.reload(); onMessage(success); }
    catch (reason) { onMessage(reason instanceof Error ? reason.message : 'Nie udało się zapisać zmiany.', true); }
  }
  function change(item: Apparatus, kind: 'rename' | 'hide' | 'time' | 'up' | 'down') {
    const index = items.findIndex((x) => x.id === item.id);
    if (kind === 'rename') { const next = prompt('Nowa nazwa sprzętu:', item.name); if (!next?.trim()) return; return void run(() => api.updateApparatus({ ...item, name: next.trim() }), 'Zapisano sprzęt.'); }
    if (kind === 'hide') return void run(() => api.updateApparatus({ ...item, hidden: !item.hidden }), item.hidden ? 'Sprzęt jest znowu widoczny.' : 'Sprzęt ukryto. Dawne treningi go zachowują.');
    if (kind === 'time') return void run(() => api.updateApparatus({ ...item, tracksTime: !item.tracksTime }), item.tracksTime ? 'Pole czasu nie będzie się pokazywać na tym sprzęcie.' : 'Na tym sprzęcie można teraz wpisywać czas.');
    const other = items[index + (kind === 'up' ? -1 : 1)]; if (!other) return;
    void run(() => Promise.all([api.updateApparatus({ ...item, sortOrder: other.sortOrder ?? 0 }), api.updateApparatus({ ...other, sortOrder: item.sortOrder ?? 0 })]), 'Zmieniono kolejność.');
  }
  async function add(event: FormEvent) {
    event.preventDefault(); if (!name.trim()) return; setSaving(true);
    await run(() => api.createApparatus({ name: name.trim(), catalog: 'trampoline', tracksTime }), 'Dodano sprzęt.');
    setSaving(false); setAdding(false); setName(''); setTracksTime(false);
  }

  return <section className="settings-card">
    <div className="settings-heading"><h2>Na czym skaczę</h2>{!adding && <button onClick={() => setAdding(true)}>+ Dodaj</button>}</div>
    <p className="settings-copy">Sprzęt wybierasz przy każdym wejściu. Pierwszy z góry jest domyślny w nowym treningu, a kolejne wejście dostaje sprzęt z poprzedniego. Statystyki liczą się osobno dla każdego sprzętu.</p>
    {adding && <form className="form-stack inset apparatus-form" onSubmit={add}>
      <label>Nazwa<input autoFocus value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} placeholder="np. Trampolina 2"/></label>
      <label>Zapis elementów<select value="trampoline" onChange={() => undefined}><option value="trampoline">Trampolinowy (trampolina, DMT)</option><option value="tumbling" disabled>Ścieżkowy — wkrótce</option></select><small>Wybierasz raz, przy dodawaniu. Później nie da się go zmienić.</small></label>
      <label className="check-row"><input type="checkbox" checked={tracksTime} onChange={(e) => setTracksTime(e.target.checked)}/><span><strong>Mierzę czas</strong><small>Przy elementach na tym sprzęcie pojawi się pole czasu.</small></span></label>
      <div className="sheet-actions"><button type="button" className="button secondary" onClick={() => setAdding(false)}>Anuluj</button><button className="button primary" disabled={saving}>{saving ? 'Dodaję…' : 'Dodaj sprzęt'}</button></div>
    </form>}
    {list.error ? <p className="form-error">{list.error}</p> : <div className="execution-settings apparatus-settings">{items.map((item, index) => <div key={item.id} className={item.hidden ? 'hidden' : ''}>
      <strong>{item.name}<small>{catalogLabel(item.catalog)} · {item.tracksTime ? 'z czasem' : 'bez czasu'}{index === items.findIndex((x) => !x.hidden) ? ' · domyślny' : ''}</small></strong>
      <span>{item.hidden ? 'Ukryty' : 'Widoczny'}</span>
      <button disabled={index === 0} aria-label={`${item.name} wyżej`} onClick={() => change(item, 'up')}>↑</button>
      <button disabled={index === items.length - 1} aria-label={`${item.name} niżej`} onClick={() => change(item, 'down')}>↓</button>
      <button onClick={() => change(item, 'rename')}>Zmień nazwę</button>
      <button onClick={() => change(item, 'time')}>{item.tracksTime ? 'Bez czasu' : 'Z czasem'}</button>
      <button onClick={() => change(item, 'hide')}>{item.hidden ? 'Przywróć' : 'Ukryj'}</button>
    </div>)}</div>}
  </section>;
}
