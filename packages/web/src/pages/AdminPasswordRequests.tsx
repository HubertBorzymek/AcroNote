import { useState } from 'react';
import { api } from '../api';
import type { PasswordResetRequest } from '../types';
import { EmptyState, ErrorState, Loading, Toast } from '../components/ui';
import { useAsync } from '../hooks';

const statusLabel: Record<PasswordResetRequest['status'], string> = {
  pending: 'Czeka na Ciebie', approved: 'Zatwierdzona', done: 'Hasło zmienione', rejected: 'Odrzucona', cancelled: 'Anulowana', expired: 'Wygasła',
};
const when = (value: string | null) => value ? new Intl.DateTimeFormat('pl-PL', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(`${value.replace(' ', 'T')}Z`)) : '';

/**
 * "Forgot password?" requests. Approving lets the user set a new password on the device that sent the request;
 * the request number is how the administrator checks it is the right person.
 */
export function AdminPasswordRequests({ onChanged }: { onChanged: () => void }) {
  const [showAll, setShowAll] = useState(false);
  const list = useAsync(() => api.adminPasswordResets(showAll), [showAll]);
  const [message, setMessage] = useState('');
  async function act(action: () => Promise<unknown>, success: string) {
    try { await action(); await list.reload(); onChanged(); setMessage(success); }
    catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Nie udało się wykonać operacji.'); }
  }
  function approve(item: PasswordResetRequest) {
    if (!confirm(`Zezwolić „${item.username}” na ustawienie nowego hasła?\n\nSprawdź, czy osoba, która się do Ciebie odezwała, podała numer prośby ${item.requestNumber}.`)) return;
    void act(() => api.adminApprovePasswordReset(item.id), `Zatwierdzono. ${item.username} może teraz ustawić nowe hasło na swoim urządzeniu (przez 24 godziny).`);
  }
  return <>
    <p className="admin-notice">Ktoś, kto nie pamięta hasła, wysyła prośbę z ekranu logowania i dostaje numer. Gdy się do Ciebie odezwie, porównaj numer i zatwierdź. Nowe hasło ustawi sam, na swoim urządzeniu. Nie widzisz ani nie przekazujesz żadnych haseł ani kodów.</p>
    <div className="segmented" role="group" aria-label="Filtr próśb"><button className={!showAll ? 'active' : ''} onClick={() => setShowAll(false)}>Aktywne</button><button className={showAll ? 'active' : ''} onClick={() => setShowAll(true)}>Wszystkie</button></div>
    {list.loading ? <Loading/> : list.error ? <ErrorState message={list.error} retry={list.reload}/> : !list.data?.length ? <EmptyState icon="check" title="Brak próśb" description="Nikt nie czeka na reset hasła."/>
      : <div className="admin-users reset-requests">{list.data.map((item) => <article key={item.id} className={item.status === 'pending' || item.status === 'approved' ? '' : 'deleted'}>
        <div className="request-number small" aria-label={`Numer prośby ${item.requestNumber}`}><span>nr</span><strong>{item.requestNumber}</strong></div>
        <div><h2>{item.username}</h2><p><span className={`report-status ${item.status === 'pending' ? 'new' : item.status === 'approved' ? 'resolved' : ''}`}>{statusLabel[item.status]}</span> · wysłana {when(item.createdAt)}{item.status === 'approved' && item.approvalExpiresAt ? ` · ważna do ${when(item.approvalExpiresAt)}` : ''}</p>
          {item.message && <p className="request-message">„{item.message}”</p>}
          {item.repeatCount > 0 && <p className="hint">Ktoś jeszcze {item.repeatCount}× próbował wysłać prośbę o to konto. Jeśli numer się nie zgadza, odrzuć prośbę, a ta osoba wyśle nową.</p>}
        </div>
        {(item.status === 'pending' || item.status === 'approved') && <div className="admin-actions">
          {item.status === 'pending' && <button className="primary-action" onClick={() => approve(item)}>Zezwól na reset</button>}
          <button className="danger-link" onClick={() => confirm(item.status === 'approved' ? 'Cofnąć zgodę na reset hasła?' : 'Odrzucić tę prośbę?') && void act(() => api.adminRejectPasswordReset(item.id), item.status === 'approved' ? 'Zgodę cofnięto.' : 'Prośbę odrzucono.')}>{item.status === 'approved' ? 'Cofnij zgodę' : 'Odrzuć'}</button>
        </div>}
      </article>)}</div>}
    {message && <Toast message={message} kind={message.includes('Nie udało') || message.includes('Nie znaleziono') ? 'error' : 'success'} onClose={() => setMessage('')}/>}
  </>;
}
