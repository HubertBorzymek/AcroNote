import { FormEvent, useState } from 'react';
import { api } from '../api';
import type { TwoStepSetup } from '../types';
import { PageHeader } from '../components/ui';

const errorText = (reason: unknown, fallback: string) => reason instanceof Error ? reason.message : fallback;

/** Shows freshly generated recovery codes once. */
function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  return <div className="form-stack">
    <p className="hint">Zapisz te kody w bezpiecznym miejscu (np. zdjęcie albo kartka w domu). Każdy kod zastępuje jeden raz kod z aplikacji, gdy nie masz telefonu. Po zamknięciu nie zobaczysz ich ponownie.</p>
    <ol className="recovery-codes">{codes.map((code) => <li key={code}><code>{code}</code></li>)}</ol>
    <button className="button secondary full" onClick={() => void navigator.clipboard?.writeText(codes.join('\n')).then(() => setCopied(true), () => undefined)}>{copied ? 'Skopiowano' : 'Kopiuj kody'}</button>
    <label className="check-row"><input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)}/><span><strong>Zapisałem kody zapasowe</strong></span></label>
    <button className="button primary full" disabled={!saved} onClick={onDone}>Gotowe</button>
  </div>;
}

/** Required before the admin panel opens: the panel is reachable from the public site. */
export function AdminTwoStepSetup({ onEnabled }: { onEnabled: () => void }) {
  const [password, setPassword] = useState('');
  const [setup, setSetup] = useState<TwoStepSetup>();
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState<string[]>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function run(event: FormEvent, action: () => Promise<void>) { event.preventDefault(); setBusy(true); setError(''); try { await action(); } catch (reason) { setError(errorText(reason, 'Nie udało się wykonać operacji.')); } finally { setBusy(false); } }
  return <div className="page"><PageHeader title="Administracja" eyebrow="Weryfikacja dwuetapowa"/>
    <section className="settings-card two-step-card">
      {codes ? <><h2>Kody zapasowe</h2><RecoveryCodes codes={codes} onDone={onEnabled}/></>
        : setup ? <form className="form-stack" onSubmit={(event) => void run(event, async () => setCodes((await api.enableTwoStep(code)).recoveryCodes))}>
          <h2>2. Zeskanuj kod QR</h2>
          <p className="settings-copy">W aplikacji uwierzytelniającej (np. Google Authenticator, Microsoft Authenticator) dodaj konto i zeskanuj kod. Na tym samym telefonie dotknij linku pod kodem.</p>
          <img className="two-step-qr" src={setup.qrDataUrl} alt="Kod QR do aplikacji uwierzytelniającej"/>
          <a className="button secondary full" href={setup.uri}>Otwórz w aplikacji na tym telefonie</a>
          <p className="settings-copy">Albo wpisz klucz ręcznie: <code className="secret">{setup.secret.match(/.{1,4}/g)?.join(' ')}</code></p>
          <label>3. Kod z aplikacji<input inputMode="numeric" autoComplete="one-time-code" required maxLength={7} placeholder="123456" value={code} onChange={(e) => setCode(e.target.value)}/></label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="button primary full" disabled={busy}>{busy ? 'Sprawdzam…' : 'Włącz weryfikację'}</button>
        </form>
        : <form className="form-stack" onSubmit={(event) => void run(event, async () => setSetup(await api.startTwoStepSetup(password)))}>
          <h2>Zabezpiecz panel administratora</h2>
          <p className="settings-copy">Panel działa na publicznej stronie, więc oprócz hasła wymaga kodu z aplikacji na Twoim telefonie. Ustawisz to raz; przy kolejnych logowaniach wpiszesz 6 cyfr.</p>
          <label>1. Potwierdź hasło<input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)}/></label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="button primary full" disabled={busy}>{busy ? 'Chwila…' : 'Dalej'}</button>
        </form>}
    </section>
  </div>;
}

/** Status line in the admin panel with an option to replace the recovery codes. */
export function AdminTwoStepStatus({ recoveryCodesLeft, onChanged }: { recoveryCodesLeft: number; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState<string[]>();
  const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault(); setError('');
    try { setCodes((await api.newRecoveryCodes(code)).recoveryCodes); } catch (reason) { setError(errorText(reason, 'Nie udało się wygenerować kodów.')); }
  }
  return <div className={`two-step-status ${recoveryCodesLeft <= 2 ? 'warning' : ''}`}>
    <span>Weryfikacja dwuetapowa włączona · {recoveryCodesLeft} {recoveryCodesLeft === 1 ? 'kod zapasowy' : 'kodów zapasowych'}</span>
    <button className="text-button" onClick={() => setOpen(true)}>Nowe kody</button>
    {open && <div className="modal-backdrop above"><section className="sheet" role="dialog" aria-modal="true" aria-label="Nowe kody zapasowe">
      <PageHeader title="Nowe kody zapasowe" onBack={() => { setOpen(false); setCodes(undefined); setCode(''); }}/>
      {codes ? <RecoveryCodes codes={codes} onDone={() => { setOpen(false); setCodes(undefined); setCode(''); onChanged(); }}/>
        : <form className="form-stack" onSubmit={submit}><p className="hint">Stare kody przestaną działać. Wpisz aktualny kod z aplikacji, aby potwierdzić.</p><label>Kod z aplikacji<input inputMode="numeric" autoComplete="one-time-code" autoFocus required maxLength={7} value={code} onChange={(e) => setCode(e.target.value)}/></label>{error && <p className="form-error" role="alert">{error}</p>}<button className="button primary full">Wygeneruj nowe kody</button></form>}
    </section></div>}
  </div>;
}
