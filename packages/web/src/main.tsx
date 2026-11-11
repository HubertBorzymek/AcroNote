import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { installDiagnostics } from './diagnostics';
import './styles.css';
import { applyTheme, resolveTheme, THEME_STORAGE_KEY } from './theme';

installDiagnostics();
const initialTheme = resolveTheme(localStorage.getItem(THEME_STORAGE_KEY), matchMedia('(prefers-color-scheme: dark)').matches);
applyTheme(initialTheme);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App initialTheme={initialTheme}/>
    </ErrorBoundary>
  </StrictMode>,
);
