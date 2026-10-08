import { useState } from 'react';
import { api } from '../api';
import type { AdminBugReport } from '../types';
import { EmptyState, ErrorState, Loading, PageHeader, Toast } from '../components/ui';
import { useAsync } from '../hooks';

type Filter = 'new' | 'resolved' | 'all';

function download(report: AdminBugReport) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
  const link = Object.assign(document.createElement('a'), { href: url, download: `zgloszenie-${report.id}.json` });
  link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function AdminBugReports() {
  const [filter, setFilter] = useState<Filter>('new');
  const list = useAsync(() => api.adminBugReports(filter === 'all' ? undefined : filter), [filter]);
  const [selected, setSelected] = useState<AdminBugReport>();
  const [message, setMessage] = useState('');

  async function open(id: number) { try { setSelected(await api.adminBugReport(id)); } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Nie udało się pobrać zgłoszenia.'); } }
  async function act(action: () => Promise<void>, success: string, closeAfter = false) {
    try { await action(); await list.reload(); if (closeAfter) setSelected(undefined); else if (selected) setSelected(await api.adminBugReport(selected.id)); setMessage(success); }
    catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Nie udało się wykonać operacji.'); }
  }

  const diagnostics = selected?.diagnostics as { errors?: Array<{ at: string; source: string; message: string }>; requests?: Array<{ at: string; method: string; path: string; status: number | string; message?: string }>; navigation?: Array<{ at: string; path: string }> } | null | undefined;
  const failedRequests = diagnostics?.requests?.filter((item) => typeof item.status !== 'number' || item.status >= 400) ?? [];

  return <>
    <div className="segmented three" role="group" aria-label="Filtr zgłoszeń">{([['new', 'Nowe'], ['resolved', 'Rozwiązane'], ['all', 'Wszystkie']] as const).map(([key, label]) => <button key={key} className={filter === key ? 'active' : ''} onClick={() => setFilter(key)}>{label}</button>)}</div>
    {list.loading ? <Loading/> : list.error ? <ErrorState message={list.error} retry={list.reload}/> : !list.data?.length ? <EmptyState icon="✓" title="Brak zgłoszeń" description={filter === 'new' ? 'Nie ma nowych zgłoszeń do przejrzenia.' : 'Nic tu jeszcze nie ma.'}/>
      : <div className="admin-users">{list.data.map((item) => <article key={item.id} className={item.status === 'resolved' ? 'deleted' : ''}><div className="avatar small">#{item.id}</div><div><h2>{item.username} · {item.createdAt.slice(0, 16)}</h2><p>{item.description}</p><p>{item.page ?? '—'} · wersja {item.appVersion ?? '?'}{item.hasSnapshot ? ' · z migawką danych' : ''}</p></div><div className="admin-actions"><button onClick={() => void open(item.id)}>Szczegóły</button></div></article>)}</div>}
    {selected && <div className="modal-backdrop above"><section className="sheet wide" role="dialog" aria-modal="true"><PageHeader title={`Zgłoszenie #${selected.id}`} eyebrow={`${selected.username} · ${selected.createdAt}`} onBack={() => setSelected(undefined)}/>
      <div className="form-stack">
        <div className="report-detail"><h3>Co się stało</h3><p>{selected.description}</p>{selected.expected && <><h3>Oczekiwane</h3><p>{selected.expected}</p></>}</div>
        <dl className="report-meta"><dt>Status</dt><dd>{selected.status === 'resolved' ? `Rozwiązane ${selected.resolvedAt ?? ''}` : 'Nowe'}</dd><dt>Strona</dt><dd>{selected.page ?? '—'}</dd><dt>Wersja</dt><dd>{selected.appVersion ?? '—'}</dd><dt>Przeglądarka</dt><dd>{selected.userAgent ?? '—'}</dd><dt>Migawka danych</dt><dd>{selected.dataSnapshot ? 'dołączona' : 'brak'}</dd></dl>
        {!!diagnostics?.errors?.length && <div className="report-detail"><h3>Błędy w przeglądarce ({diagnostics.errors.length})</h3>{diagnostics.errors.map((item, index) => <p key={index} className="mono">{item.at.slice(11, 19)} [{item.source}] {item.message}</p>)}</div>}
        {!!failedRequests.length && <div className="report-detail"><h3>Nieudane zapytania ({failedRequests.length})</h3>{failedRequests.map((item, index) => <p key={index} className="mono">{item.at.slice(11, 19)} {item.method} {item.path} → {item.status}{item.message ? `: ${item.message}` : ''}</p>)}</div>}
        {!!diagnostics?.navigation?.length && <div className="report-detail"><h3>Ostatnie ekrany</h3><p className="mono">{diagnostics.navigation.map((item) => item.path).join(' → ')}</p></div>}
        <details><summary>Pełne dane diagnostyczne</summary><pre className="diagnostics-preview">{JSON.stringify(selected.diagnostics, null, 2)}</pre></details>
        {selected.dataSnapshot && <p className="hint">Aby odtworzyć dane lokalnie: pobierz JSON i uruchom <code>npm run import-report -- zgloszenie-{selected.id}.json</code></p>}
        <div className="sheet-actions">
          <button className="button secondary" onClick={() => download(selected)}>Pobierz JSON</button>
          <button className="button secondary" onClick={() => void act(() => api.adminSetBugReportStatus(selected.id, selected.status === 'resolved' ? 'new' : 'resolved'), selected.status === 'resolved' ? 'Zgłoszenie otwarto ponownie.' : 'Oznaczono jako rozwiązane.')}>{selected.status === 'resolved' ? 'Otwórz ponownie' : 'Oznacz jako rozwiązane'}</button>
          <button className="button danger" onClick={() => confirm('Usunąć to zgłoszenie bezpowrotnie?') && void act(() => api.adminDeleteBugReport(selected.id), 'Zgłoszenie usunięto.', true)}>Usuń</button>
        </div>
      </div>
    </section></div>}
    {message && <Toast message={message} kind={message.includes('Nie udało') ? 'error' : 'success'} onClose={() => setMessage('')}/>}
  </>;
}
