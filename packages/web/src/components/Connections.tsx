import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { useAsync } from '../hooks';
import type { CoachInvitation } from '../types';
import { ErrorState, Loading, Toast } from './ui';

function invitationValue(value: string) {
  const trimmed = value.trim();
  try {
    const url = new URL(trimmed, location.origin);
    return url.searchParams.get('token') ?? url.searchParams.get('invite') ?? url.pathname.split('/').filter(Boolean).at(-1) ?? trimmed;
  } catch { return trimmed; }
}

function statusLabel(status: CoachInvitation['status']) {
  return { pending: 'Oczekuje', accepted: 'Połączono', cancelled: 'Anulowane', expired: 'Wygasło' }[status];
}

export function InvitationPanel({ role, initialValue = '', onConnected }: { role: 'athlete' | 'coach'; initialValue?: string; onConnected?: () => void }) {
  const invitations = useAsync(api.invitations, []);
  const [created, setCreated] = useState<CoachInvitation | null>(null);
  const [code, setCode] = useState(initialValue);
  const [busy, setBusy] = useState(false);
  const [consent, setConsent] = useState(false);
  const [preview, setPreview] = useState<{ credential: string; creatorUsername: string; requiredProfile: 'athlete' | 'coach'; expiresAt: string } | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);
  const own = useMemo(() => (invitations.data ?? []).filter((item) => item.role === role), [invitations.data, role]);
  useEffect(() => {
    const value = invitationValue(initialValue); if (!value) return;
    void api.previewInvitation(value).then((item) => setPreview({ credential: value, ...item })).catch(() => undefined);
  }, [initialValue]);
  async function create() {
    setBusy(true);
    try { const item = await api.createInvitation(role); setCreated(item); await invitations.reload(); setError(false); setMessage('Zaproszenie jest gotowe.'); }
    catch (reason) { setError(true); setMessage(reason instanceof Error ? reason.message : 'Nie udało się utworzyć zaproszenia.'); }
    finally { setBusy(false); }
  }
  async function accept() {
    const value = invitationValue(code); if (!value) return;
    setBusy(true);
    try {
      if (preview?.credential !== value) { const item = await api.previewInvitation(value); setPreview({ credential: value, ...item }); setError(false); setMessage('Sprawdź dane zaproszenia i potwierdź połączenie.'); return; }
      if (preview.requiredProfile !== role) { setError(true); setMessage(`To zaproszenie wymaga profilu ${preview.requiredProfile === 'coach' ? 'trenera' : 'zawodnika'}. Przełącz profil i spróbuj ponownie.`); return; }
      if (preview.requiredProfile === 'athlete' && !consent) { setError(true); setMessage('Potwierdź świadome udostępnienie historii trenerowi.'); return; }
      await api.acceptInvitation(value); setCode(''); setConsent(false); setPreview(null); await invitations.reload(); onConnected?.(); setError(false); setMessage(preview.requiredProfile === 'athlete' ? 'Trener otrzymał dostęp do Twojej historii.' : 'Połączono z zawodnikiem.');
    }
    catch (reason) { setError(true); setMessage(reason instanceof Error ? reason.message : 'Nie udało się przyjąć zaproszenia.'); }
    finally { setBusy(false); }
  }
  async function cancel(id: string) {
    if (!confirm('Anulować to zaproszenie? Link, kod i QR przestaną działać.')) return;
    setBusy(true);
    try { await api.cancelInvitation(id); if (created?.id === id) setCreated(null); await invitations.reload(); setError(false); setMessage('Zaproszenie zostało anulowane.'); }
    catch (reason) { setError(true); setMessage(reason instanceof Error ? reason.message : 'Nie udało się anulować zaproszenia.'); }
    finally { setBusy(false); }
  }
  if (invitations.loading) return <Loading/>;
  if (invitations.error) return <ErrorState message={invitations.error} retry={invitations.reload}/>;
  const shareUrl = created ? new URL(created.path ?? `/connect?token=${created.token ?? ''}`, location.origin).toString() : '';
  return <div className="connections-panel">
    <div className="connections-grid">
      <section className="connection-action"><h3>Wyślij zaproszenie</h3><p>{role === 'athlete' ? 'Trener po zaakceptowaniu zobaczy Twoją historię tylko do odczytu.' : 'Zawodnik musi świadomie zaakceptować udostępnienie historii.'}</p><button className="button primary" disabled={busy} onClick={() => void create()}>Utwórz kod, link i QR</button></section>
      <section className="connection-action"><h3>Masz zaproszenie?</h3><p>Wpisz krótki kod albo wklej cały link.</p><div className="invitation-input"><input aria-label="Kod lub link zaproszenia" value={code} onChange={(event) => { setCode(event.target.value); setPreview(null); setConsent(false); }} placeholder="Np. K7P4M2"/><button className="button secondary" disabled={busy || !code.trim()} onClick={() => void accept()}>{preview?.credential === invitationValue(code) ? 'Połącz' : 'Sprawdź'}</button></div>{preview?.credential === invitationValue(code) && <div className="invitation-preview"><strong>Zaprasza: {preview.creatorUsername}</strong><span>Ważne do {new Intl.DateTimeFormat('pl-PL', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(preview.expiresAt))}</span>{preview.requiredProfile !== role && <b>Przełącz na profil {preview.requiredProfile === 'coach' ? 'trenera' : 'zawodnika'}, aby przyjąć.</b>}</div>}{preview?.requiredProfile === 'athlete' && preview.credential === invitationValue(code) && <label className="history-consent"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)}/><span>Świadomie udostępniam trenerowi {preview.creatorUsername} całą historię treningów, elementów, układów i statystyk w trybie tylko do odczytu.</span></label>}</section>
    </div>
    {created && <section className="invitation-ticket"><div><span>Kod zaproszenia</span><strong>{created.shortCode}</strong><small>Ważne do {new Intl.DateTimeFormat('pl-PL', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(created.expiresAt))}</small></div>{created.qrDataUrl && <img src={created.qrDataUrl} alt="Kod QR zaproszenia"/>}<label>Link<input readOnly value={shareUrl} onFocus={(event) => event.currentTarget.select()}/></label><button className="button secondary" onClick={() => void navigator.clipboard?.writeText(shareUrl)}>Kopiuj link</button></section>}
    {!!own.length && <div className="invitation-list"><h3>Twoje zaproszenia</h3>{own.map((item) => <div key={item.id}><div><strong>{item.shortCode ?? 'Zaproszenie'}</strong><small>{statusLabel(item.status)} · ważne do {new Intl.DateTimeFormat('pl-PL', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(item.expiresAt))}</small></div>{item.status === 'pending' && <button className="danger-link" disabled={busy} onClick={() => void cancel(item.id)}>Anuluj</button>}</div>)}</div>}
    {message && <Toast message={message} kind={error ? 'error' : 'success'} onClose={() => setMessage('')}/>} 
  </div>;
}
