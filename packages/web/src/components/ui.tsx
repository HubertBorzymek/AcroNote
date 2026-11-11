import type { ReactNode } from 'react';
import { openBugReport } from './BugReport';

export type IconName = 'home' | 'spark' | 'routine' | 'chart' | 'user' | 'admin' | 'plus' | 'search' | 'back' | 'more' | 'journal' | 'target' | 'check' | 'sun' | 'moon' | 'clock' | 'chevron' | 'key';

// Decorative symbols are always SVG: iOS draws characters such as an arrow as a coloured emoji tile.
export function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, ReactNode> = {
    home: <><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v10h13V10M9 20v-6h6v6"/></>,
    spark: <><path d="M12 3 9.8 9.8 3 12l6.8 2.2L12 21l2.2-6.8L21 12l-6.8-2.2Z"/><path d="m5 3 .6 1.4L7 5l-1.4.6L5 7l-.6-1.4L3 5l1.4-.6Z"/></>,
    routine: <><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M8 9h8M8 13h8M8 17h5"/></>,
    chart: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></>,
    user: <><circle cx="12" cy="8" r="4"/><path d="M4 21c.7-4 3.4-6 8-6s7.3 2 8 6"/></>,
    admin: <><path d="M12 3 20 6v5c0 5-3.4 8.5-8 10-4.6-1.5-8-5-8-10V6Z"/><path d="m9 12 2 2 4-5"/></>,
    plus: <path d="M12 5v14M5 12h14"/>,
    search: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></>,
    back: <><path d="m15 18-6-6 6-6"/></>,
    more: <><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>,
    journal: <><path d="M7 17 17 7"/><path d="M9 7h8v8"/></>,
    target: <><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.5"/></>,
    check: <path d="m5 12.5 4.5 4.5L19 7.5"/>,
    sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/></>,
    moon: <path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10Z"/>,
    clock: <><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9.5 2.5h5"/></>,
    chevron: <path d="m6 9 6 6 6-6"/>,
    key: <><circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M17 6l3 3M15 8l2 2"/></>,
  };
  return <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
}

export function Loading() {
  return <div className="state"><span className="spinner"/><p>Ładowanie danych…</p></div>;
}

export function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  return <div className="state error-state"><span className="state-mark">!</span><h2>Coś poszło nie tak</h2><p>{message}</p>{retry && <button className="button secondary" onClick={retry}>Spróbuj ponownie</button>}<button className="text-button" onClick={openBugReport}>Zgłoś problem</button></div>;
}

export function EmptyState({ icon, title, description, action }: { icon: IconName; title: string; description: string; action?: ReactNode }) {
  return <div className="state empty"><span className="empty-icon"><Icon name={icon}/></span><h2>{title}</h2><p>{description}</p>{action}</div>;
}

export function Toast({ message, kind = 'success', onClose }: { message: string; kind?: 'success' | 'error'; onClose: () => void }) {
  return <div className={`toast ${kind}`} role="status"><span>{kind === 'success' ? <Icon name="check"/> : '!'}</span><p>{message}</p><button aria-label="Zamknij" onClick={onClose}>×</button></div>;
}

export function Counter({ value, onChange, label = 'Liczba powtórzeń', disabled = false }: { value: number; onChange: (value: number) => void; label?: string; disabled?: boolean }) {
  return <div className={`counter ${disabled ? 'disabled' : ''}`} aria-label={label}>
    <button type="button" disabled={disabled} onClick={() => onChange(Math.max(1, value - 1))} aria-label="Zmniejsz">−</button>
    <input aria-label={label} disabled={disabled} inputMode="numeric" min="1" type="number" value={value} onChange={(e) => onChange(Math.max(1, Number(e.target.value) || 1))}/>
    <button type="button" disabled={disabled} onClick={() => onChange(value + 1)} aria-label="Zwiększ">+</button>
  </div>;
}

export function PageHeader({ title, eyebrow, onBack, action }: { title: string; eyebrow?: string; onBack?: () => void; action?: ReactNode }) {
  return <header className="page-header">
    {onBack && <button className="icon-button" onClick={onBack} aria-label="Wróć"><Icon name="back"/></button>}
    <div className="page-title">{eyebrow && <span>{eyebrow}</span>}<h1>{title}</h1></div>
    {action}
  </header>;
}
