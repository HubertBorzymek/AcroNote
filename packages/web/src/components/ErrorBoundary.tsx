import { Component, type ErrorInfo, type ReactNode } from 'react';
import { recordError } from '../diagnostics';
import { BugReportDialog } from './BugReport';

/** Without a boundary a render error leaves a blank page; this shows a recovery screen instead. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean; reporting: boolean }> {
  state = { failed: false, reporting: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) {
    recordError('render', Object.assign(new Error(error.message), { stack: `${error.stack ?? ''}\nKomponenty:${info.componentStack ?? ''}` }));
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return <div className="centered-page"><div className="state error-state"><span className="state-mark">!</span><h2>Coś poszło nie tak</h2>
      <p>Aplikacja napotkała nieoczekiwany błąd. Odśwież stronę. Twoje zapisane dane są bezpieczne.</p>
      <div className="sheet-actions"><button className="button secondary" onClick={() => this.setState({ reporting: true })}>Zgłoś problem</button><button className="button primary" onClick={() => location.reload()}>Odśwież stronę</button></div>
      {this.state.reporting && <BugReportDialog onClose={() => this.setState({ reporting: false })}/>}
    </div></div>;
  }
}
