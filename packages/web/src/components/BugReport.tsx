import { FormEvent, useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { collectDiagnostics } from '../diagnostics';
import { PageHeader } from './ui';

const OPEN_EVENT = 'acronote:bug-report';
export const SENT_EVENT = 'acronote:bug-report-sent';

/** Opens the report dialog from anywhere (error screens, profile, error boundary). */
export function openBugReport() { window.dispatchEvent(new Event(OPEN_EVENT)); }

export function useBugReportDialog() {
  const [open, setOpen] = useState(false);
  useEffect(() => { const show = () => setOpen(true); addEventListener(OPEN_EVENT, show); return () => removeEventListener(OPEN_EVENT, show); }, []);
  return { open, close: () => setOpen(false) };
}

export function BugReportDialog({ onClose, onSent }: { onClose: () => void; onSent?: (id: number) => void }) {
  // Captured when the dialog opens, i.e. as close as possible to the moment the problem happened.
  const diagnostics = useMemo(collectDiagnostics, []);
  const [description, setDescription] = useState('');
  const [expected, setExpected] = useState('');
  const [includeSnapshot, setIncludeSnapshot] = useState(true);
  const [showDetails, setShowDetails] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [sentId, setSentId] = useState<number>();

  function close() {
    if (!sentId && description.trim() && !confirm('Odrzucić niewysłane zgłoszenie?')) return;
    onClose();
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); setSending(true); setError('');
    try {
      const result = await api.sendBugReport({ description, expected: expected || undefined, page: diagnostics.page, includeSnapshot, diagnostics });
      setSentId(result.id); onSent?.(result.id); dispatchEvent(new Event(SENT_EVENT));
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Nie udało się wysłać zgłoszenia.'); }
    finally { setSending(false); }
  }

  return <div className="modal-backdrop above"><section className="sheet wide" role="dialog" aria-modal="true" aria-label="Zgłoś problem">
    <PageHeader title="Zgłoś problem" eyebrow={`AcroNote ${diagnostics.appVersion}`} onBack={close}/>
    {sentId ? <div className="form-stack">
      <p className="hint">Dziękujemy! Zgłoszenie <strong>#{sentId}</strong> zostało zapisane. Jego status zobaczysz w profilu.</p>
      <button className="button primary full" onClick={onClose}>Zamknij</button>
    </div> : <form className="form-stack" onSubmit={submit}>
      <label>Co się stało?<textarea value={description} onChange={(e) => setDescription(e.target.value)} required minLength={5} maxLength={5000} rows={4} autoFocus placeholder="np. Po zapisaniu treningu statystyki pokazują 0 elementów"/></label>
      <label>Czego się spodziewałeś? (opcjonalnie)<textarea value={expected} onChange={(e) => setExpected(e.target.value)} maxLength={5000} rows={2}/></label>
      <label className="check-row"><input type="checkbox" checked={includeSnapshot} onChange={(e) => setIncludeSnapshot(e.target.checked)}/><span><strong>Dołącz kopię moich danych</strong><small>Elementy, układy i treningi pozwolą odtworzyć problem. Bez haseł i danych logowania.</small></span></label>
      <p className="hint">Do zgłoszenia trafią też informacje techniczne: wersja aplikacji, przeglądarka, ostatnio otwierane ekrany oraz ostatnie operacje i błędy. Bez treści formularzy i haseł.</p>
      <button type="button" className="text-button" onClick={() => setShowDetails(!showDetails)}>{showDetails ? 'Ukryj dane techniczne' : 'Pokaż dane techniczne'}</button>
      {showDetails && <pre className="diagnostics-preview">{JSON.stringify(diagnostics, null, 2)}</pre>}
      {error && <p className="form-error">{error}</p>}
      <div className="sheet-actions"><button type="button" className="button secondary" onClick={close}>Anuluj</button><button className="button primary" disabled={sending || description.trim().length < 5}>{sending ? 'Wysyłanie…' : 'Wyślij zgłoszenie'}</button></div>
    </form>}
  </section></div>;
}
