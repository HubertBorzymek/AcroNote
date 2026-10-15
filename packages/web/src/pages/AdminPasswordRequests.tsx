import { useState } from 'react';
import { api } from '../api';
import type { ResetCode } from '../types';
import { EmptyState, ErrorState, Loading, PageHeader, Toast } from '../components/ui';
import { useAsync } from '../hooks';

/** Shows a freshly generated one-time code once, with what to tell the user. */
export function ResetCodeDialog({ result, onClose }: { result: ResetCode; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = () => void navigator.clipboard?.writeText(result.code).then(() => setCopied(true), () => undefined);
  return <div className="modal-backdrop above"><section className="sheet" role="dialog" aria-modal="true" aria-label="Kod resetu hasła">
    <PageHeader title="Kod resetu hasła" eyebrow={result.username} onBack={onClose}/>
    <div className="form-stack">
      <div className="reset-code"><strong>{result.code}</strong><button className="button secondary compact" onClick={copy}>{copied ? 'Skopiowano' : 'Kopiuj'}</button></div>
      <p className="hint">Przekaż kod użytkownikowi „{result.username}” (osobiście, SMS-em albo komunikatorem). Loguje się nim <strong>zamiast hasła</strong>, a potem ustawia nowe hasło. Kod jest jednorazowy i ważny {result.validHours} godziny (do {result.expiresAt} UTC). Dotychczasowe hasło działa, dopóki kod nie zostanie użyty.</p>
      <p className="settings-copy">Kod nie jest nigdzie zapisany w czytelnej postaci. Po zamknięciu tego okna nie da się go zobaczyć ponownie, można tylko wygenerować nowy.</p>
      <button className="button primary full" onClick={onClose}>Gotowe</button>
    </div>
  </section></div>;
}

export function AdminPasswordRequests({ onChanged }: { onChanged: () => void }) {
  const [showAll, setShowAll] = useState(false);
  const list = useAsync(() => api.adminPasswordRequests(showAll), [showAll]);
  const [code, setCode] = useState<ResetCode>();
  const [message, setMessage] = useState('');
  async function act(action: () => Promise<unknown>, success?: string) {
    try { await action(); await list.reload(); onChanged(); if (success) setMessage(success); }
    catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Nie udało się wykonać operacji.'); }
  }
  const statusLabel = { pending: 'Oczekuje', done: 'Kod wydany', rejected: 'Odrzucona' } as const;
  return <>
    <p className="admin-notice">Użytkownik, który nie pamięta hasła, wysyła prośbę z ekranu logowania (najwyżej raz na dobę). Wygeneruj dla niego jednorazowy kod i przekaż mu go. Hasła nigdy nie są widoczne.</p>
    <div className="segmented" role="group" aria-label="Filtr próśb"><button className={!showAll ? 'active' : ''} onClick={() => setShowAll(false)}>Oczekujące</button><button className={showAll ? 'active' : ''} onClick={() => setShowAll(true)}>Wszystkie</button></div>
    {list.loading ? <Loading/> : list.error ? <ErrorState message={list.error} retry={list.reload}/> : !list.data?.length ? <EmptyState icon="✓" title="Brak próśb" description="Nikt nie czeka na reset hasła."/>
      : <div className="admin-users">{list.data.map((item) => <article key={item.id} className={item.status === 'pending' ? '' : 'deleted'}><div className="avatar small">{item.username[0]?.toUpperCase()}</div><div><h2>{item.username}</h2><p>{statusLabel[item.status]} · {item.createdAt.slice(0, 16)}{item.resetCodeActive ? ' · ma aktywny kod' : ''}</p>{item.message && <p className="request-message">„{item.message}”</p>}</div>
        {item.status === 'pending' && <div className="admin-actions"><button onClick={() => void act(async () => setCode(await api.adminResetCode(String(item.userId))))}>Wygeneruj kod</button><button className="danger-link" onClick={() => void act(() => api.adminRejectPasswordRequest(item.id), 'Prośbę odrzucono.')}>Odrzuć</button></div>}</article>)}</div>}
    {code && <ResetCodeDialog result={code} onClose={() => setCode(undefined)}/>}
    {message && <Toast message={message} kind={message.includes('Nie udało') ? 'error' : 'success'} onClose={() => setMessage('')}/>}
  </>;
}
