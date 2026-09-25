import { useEffect, useState } from 'react';
import { api, ApiError } from './api';
import type { User } from './types';
import { Auth } from './components/Auth';
import { ErrorState, Icon, Loading } from './components/ui';
import { TrainingsPage } from './pages/TrainingsPage';
import { ElementsPage } from './pages/ElementsPage';
import { RoutinesPage } from './pages/RoutinesPage';
import { StatsPage } from './pages/StatsPage';
import { ProfilePage } from './pages/ProfilePage';

type Route = 'trainings' | 'elements' | 'routines' | 'stats' | 'profile';
const validRoutes: Route[] = ['trainings', 'elements', 'routines', 'stats', 'profile'];
function routeFromUrl(): Route { const value = location.pathname.split('/').filter(Boolean)[0] as Route; return validRoutes.includes(value) ? value : 'trainings'; }

export function App() {
  const [user, setUser] = useState<User | null>();
  const [loadError, setLoadError] = useState('');
  const [route, setRoute] = useState<Route>(routeFromUrl);
  const [dirty, setDirty] = useState(false);
  async function loadUser() { setLoadError(''); try { setUser(await api.me()); } catch (reason) { if (reason instanceof ApiError && reason.status === 401) setUser(null); else setLoadError(reason instanceof Error ? reason.message : 'Nie udało się połączyć z serwerem.'); } }
  useEffect(() => { void loadUser(); }, []);
  useEffect(() => { const pop = () => { if (dirty && !confirm('Masz niezapisane zmiany. Opuścić formularz?')) { history.pushState({}, '', `/${route}`); return; } setDirty(false); setRoute(routeFromUrl()); }; addEventListener('popstate', pop); return () => removeEventListener('popstate', pop); }, [dirty, route]);
  function navigate(next: Route) { if (route === next) return; if (dirty && !confirm('Masz niezapisane zmiany. Opuścić formularz?')) return; setDirty(false); history.pushState({}, '', `/${next}`); setRoute(next); window.scrollTo(0, 0); }
  async function logout() { await api.logout(); setUser(null); history.replaceState({}, '', '/trainings'); setRoute('trainings'); }
  if (user === undefined && !loadError) return <div className="app-loading"><div className="logo-mark">A</div><Loading/></div>;
  if (loadError) return <div className="centered-page"><ErrorState message={loadError} retry={loadUser}/></div>;
  if (!user) return <Auth onAuthenticated={setUser}/>;
  const pages = { trainings: <TrainingsPage setDirty={setDirty}/>, elements: <ElementsPage setDirty={setDirty}/>, routines: <RoutinesPage setDirty={setDirty}/>, stats: <StatsPage/>, profile: <ProfilePage user={user} onLogout={logout}/> };
  const navigation: Array<[Route, string, Parameters<typeof Icon>[0]['name']]> = [['trainings', 'Treningi', 'home'], ['elements', 'Elementy', 'spark'], ['routines', 'Układy', 'routine'], ['stats', 'Statystyki', 'chart'], ['profile', 'Profil', 'user']];
  return <div className="app-shell"><aside className="sidebar"><div className="brand"><div className="logo-mark">A</div><div><strong>AcroNote</strong><span>Dziennik akrobatyczny</span></div></div><nav>{navigation.map(([key, label, icon]) => <button className={route === key ? 'active' : ''} key={key} onClick={() => navigate(key)}><Icon name={icon}/><span>{label}</span></button>)}</nav><div className="sidebar-user"><span>{user.username.slice(0, 1).toUpperCase()}</span><div><strong>{user.username}</strong><small>Profil zawodnika</small></div></div></aside><main className="content">{pages[route]}</main><nav className="bottom-nav">{navigation.map(([key, label, icon]) => <button className={route === key ? 'active' : ''} key={key} onClick={() => navigate(key)}><Icon name={icon}/><span>{label}</span></button>)}</nav></div>;
}
