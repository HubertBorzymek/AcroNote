import { useEffect, useState } from 'react';
import { api, ApiError } from './api';
import type { User } from './types';
import { Auth, SetNewPassword } from './components/Auth';
import { ErrorState, Icon, Loading } from './components/ui';
import { TrainingsPage } from './pages/TrainingsPage';
import { ElementsPage } from './pages/ElementsPage';
import { RoutinesPage } from './pages/RoutinesPage';
import { StatsPage } from './pages/StatsPage';
import { ProfilePage } from './pages/ProfilePage';
import { AdminPage } from './pages/AdminPage';
import { CoachPage } from './pages/CoachPage';
import { applyTheme, THEME_STORAGE_KEY, type Theme } from './theme';
import { BugReportDialog, useBugReportDialog } from './components/BugReport';
import { recordNavigation } from './diagnostics';

type Route = 'trainings' | 'elements' | 'routines' | 'stats' | 'coach' | 'profile' | 'admin';
type ProfileMode = 'athlete' | 'coach';
const validRoutes: Route[] = ['trainings', 'elements', 'routines', 'stats', 'coach', 'profile', 'admin'];
function routeFromUrl(): Route { const value = location.pathname.split('/').filter(Boolean)[0] as Route; if (location.pathname.startsWith('/connect') || location.pathname.startsWith('/zaproszenie')) return 'profile'; return validRoutes.includes(value) ? value : 'trainings'; }
function invitationFromUrl() { const query = new URLSearchParams(location.search); return query.get('token') ?? query.get('invite') ?? (location.pathname.startsWith('/connect/') || location.pathname.startsWith('/zaproszenie/') ? location.pathname.split('/').filter(Boolean).at(-1) ?? '' : ''); }

export function App({ initialTheme = 'light' }: { initialTheme?: Theme }) {
  const [user, setUser] = useState<User | null>();
  const [loadError, setLoadError] = useState('');
  const [route, setRoute] = useState<Route>(routeFromUrl);
  const [dirty, setDirty] = useState(false);
  const [mode, setMode] = useState<ProfileMode>(() => localStorage.getItem('acronote-profile') === 'coach' ? 'coach' : 'athlete');
  const [invitationTarget, setInvitationTarget] = useState<ProfileMode>();
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const invitation = invitationFromUrl();
  const report = useBugReportDialog();
  useEffect(() => { recordNavigation(location.pathname); }, [route]);
  async function loadUser() { setLoadError(''); try { setUser(await api.me()); } catch (reason) { if (reason instanceof ApiError && reason.status === 401) setUser(null); else setLoadError(reason instanceof Error ? reason.message : 'Nie udało się połączyć z serwerem.'); } }
  useEffect(() => { void loadUser(); }, []);
  useEffect(() => { applyTheme(theme); localStorage.setItem(THEME_STORAGE_KEY, theme); }, [theme]);
  useEffect(() => {
    if (!user) return;
    const enabled = user.coachEnabled ?? user.coachProfile ?? false;
    const athleteEnabled = user.athleteEnabled ?? user.athleteProfile ?? true;
    if (!athleteEnabled && enabled && mode !== 'coach') { setMode('coach'); localStorage.setItem('acronote-profile', 'coach'); history.replaceState({}, '', '/coach'); setRoute('coach'); return; }
    if (route === 'coach' && enabled && mode !== 'coach') { setMode('coach'); localStorage.setItem('acronote-profile', 'coach'); return; }
    if (route === 'coach' && !enabled) { history.replaceState({}, '', '/profile'); setRoute('profile'); return; }
    if (mode === 'coach' && enabled && ['trainings', 'elements', 'routines', 'stats'].includes(route)) { history.replaceState({}, '', '/coach'); setRoute('coach'); }
  }, [mode, route, user]);
  useEffect(() => {
    if (!user || !invitation) return;
    let active = true;
    void api.previewInvitation(invitation).then((preview) => {
      if (!active) return;
      setInvitationTarget(preview.requiredProfile);
      const coachEnabled = user.coachEnabled ?? user.coachProfile ?? false;
      if (preview.requiredProfile === 'coach' && coachEnabled) { setMode('coach'); localStorage.setItem('acronote-profile', 'coach'); setRoute('coach'); }
      else { setMode('athlete'); localStorage.setItem('acronote-profile', 'athlete'); setRoute('profile'); }
    }).catch(() => { if (active) setInvitationTarget(undefined); });
    return () => { active = false; };
  }, [invitation, user]);
  useEffect(() => { const pop = () => { if (dirty && !confirm('Masz niezapisane zmiany. Opuścić formularz?')) { history.pushState({}, '', `/${route}`); return; } setDirty(false); setRoute(routeFromUrl()); }; addEventListener('popstate', pop); return () => removeEventListener('popstate', pop); }, [dirty, route]);
  function navigate(next: Route) { if (route === next) return; if (dirty && !confirm('Masz niezapisane zmiany. Opuścić formularz?')) return; setDirty(false); history.pushState({}, '', `/${next}`); setRoute(next); window.scrollTo(0, 0); }
  async function logout() { await api.logout(); setUser(null); history.replaceState({}, '', '/trainings'); setRoute('trainings'); }
  if (user === undefined && !loadError) return <div className="app-loading"><div className="logo-mark">A</div><Loading/></div>;
  if (loadError) return <div className="centered-page"><ErrorState message={loadError} retry={loadUser}/>{report.open && <BugReportDialog onClose={report.close}/>}</div>;
  if (!user) return <Auth onAuthenticated={setUser}/>;
  if (user.mustChangePassword) return <SetNewPassword user={user} onDone={setUser} onLogout={() => void logout()}/>;
  const coachEnabled = user.coachEnabled ?? user.coachProfile ?? false;
  const athleteEnabled = user.athleteEnabled ?? user.athleteProfile ?? true;
  const effectiveMode = (mode === 'coach' || !athleteEnabled) && coachEnabled ? 'coach' : 'athlete';
  function switchMode(next: ProfileMode) { if (next === 'coach' && !coachEnabled) { navigate('profile'); return; } setMode(next); localStorage.setItem('acronote-profile', next); const nextRoute = next === 'coach' ? 'coach' : 'trainings'; history.pushState({}, '', `/${nextRoute}`); setRoute(nextRoute); }
  const profile = <ProfilePage user={user} onLogout={logout} onUserChange={setUser} theme={theme} onThemeChange={setTheme} invitation={invitationTarget === 'athlete' ? invitation : ''} pendingCoachInvitation={invitationTarget === 'coach' ? invitation : ''}/>;
  const pages = { trainings: <TrainingsPage setDirty={setDirty}/>, elements: <ElementsPage setDirty={setDirty}/>, routines: <RoutinesPage setDirty={setDirty}/>, stats: <StatsPage/>, coach: <CoachPage invitation={invitationTarget === 'coach' ? invitation : ''}/>, profile, admin: user.isAdmin ? <AdminPage currentUser={user}/> : profile };
  const navigation: Array<[Route, string, Parameters<typeof Icon>[0]['name']]> = effectiveMode === 'coach' ? [['coach', 'Zawodnicy', 'user'], ['profile', 'Profil', 'admin']] : [['trainings', 'Treningi', 'home'], ['elements', 'Elementy', 'spark'], ['routines', 'Układy', 'routine'], ['stats', 'Statystyki', 'chart'], ['profile', 'Profil', 'user']];
  if (user.isAdmin) navigation.push(['admin', 'Admin', 'admin']);
  return <div className="app-shell"><aside className="sidebar"><div className="brand"><div className="logo-mark">A</div><div><strong>AcroNote</strong><span>Dziennik akrobatyczny</span></div></div>{coachEnabled && <div className="profile-switch"><button className={effectiveMode === 'athlete' ? 'active' : ''} onClick={() => switchMode('athlete')}>Zawodnik</button><button className={effectiveMode === 'coach' ? 'active' : ''} onClick={() => switchMode('coach')}>Trener</button></div>}<nav>{navigation.map(([key, label, icon]) => <button className={route === key ? 'active' : ''} key={key} onClick={() => navigate(key)}><Icon name={icon}/><span>{label}</span></button>)}</nav><div className="sidebar-user"><span>{user.username.slice(0, 1).toUpperCase()}</span><div><strong>{user.username}</strong><small>Profil {effectiveMode === 'coach' ? 'trenera' : 'zawodnika'}</small></div></div></aside><main className="content">{user.impersonatedBy && <div className="impersonation-banner" role="status"><span>Przeglądasz konto <strong>{user.username}</strong> jako administrator. Zmiany są prawdziwe.</span><button onClick={() => void api.endImpersonation().finally(() => { location.href = '/admin'; })}>Wróć do panelu admina</button></div>}{coachEnabled && <div className="mobile-profile-switch"><button className={effectiveMode === 'athlete' ? 'active' : ''} onClick={() => switchMode('athlete')}>Zawodnik</button><button className={effectiveMode === 'coach' ? 'active' : ''} onClick={() => switchMode('coach')}>Trener</button></div>}{pages[route]}</main><nav className="bottom-nav">{navigation.map(([key, label, icon]) => <button className={route === key ? 'active' : ''} key={key} onClick={() => navigate(key)}><Icon name={icon}/><span>{label}</span></button>)}</nav>{report.open && <BugReportDialog onClose={report.close}/>}</div>;
}
