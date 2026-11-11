import { useEffect, useState } from 'react';
import { api } from '../api';
import type { AdminUserData, Training, User } from '../types';
import { ErrorState, Loading, PageHeader, Toast } from '../components/ui';
import { useAsync } from '../hooks';
import { AdminBugReports } from './AdminBugReports';
import { AdminPasswordRequests } from './AdminPasswordRequests';
import { AdminTwoStepSetup, AdminTwoStepStatus } from './AdminTwoStep';

/** Lets the navigation badge refresh after the administrator handled something. */
export const ADMIN_SUMMARY_EVENT = 'acronote-admin-summary';
const summaryChanged = () => dispatchEvent(new Event(ADMIN_SUMMARY_EVENT));

export function AdminPage({ currentUser }: { currentUser: User }) {
  const twoStep = useAsync(api.twoStepStatus, []);
  if (twoStep.loading) return <Loading/>;
  if (twoStep.error || !twoStep.data) return <ErrorState message={twoStep.error || 'Brak danych.'} retry={twoStep.reload}/>;
  if (!twoStep.data.enabled) return <AdminTwoStepSetup onEnabled={() => { void twoStep.reload(); summaryChanged(); }}/>;
  return <AdminPanel currentUser={currentUser} recoveryCodesLeft={twoStep.data.recoveryCodesLeft} onTwoStepChanged={() => void twoStep.reload()}/>;
}

function AdminPanel({ currentUser, recoveryCodesLeft, onTwoStepChanged }: { currentUser: User; recoveryCodesLeft: number; onTwoStepChanged: () => void }) {
  const summary = useAsync(api.adminSummary, []);
  const result = useAsync(api.adminUsers, []);
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState('');
  // Open on the requests when someone is waiting for help.
  const [tab, setTab] = useState<'users' | 'passwords' | 'reports'>();
  const [selected, setSelected] = useState<{ userId: string; data: AdminUserData }>();
  const [selectedTraining, setSelectedTraining] = useState<Training>();
  const users = (result.data ?? []).filter((user) => user.username.toLocaleLowerCase('pl').includes(query.toLocaleLowerCase('pl')));
  const pending = summary.data?.pendingResets ?? 0;
  const newReports = summary.data?.newBugReports ?? 0;
  // The starting tab is chosen once; handling the last request must not move the administrator elsewhere.
  useEffect(() => { if (!tab && summary.data) setTab(summary.data.pendingResets > 0 ? 'passwords' : 'users'); }, [tab, summary.data]);
  const activeTab = tab ?? (pending > 0 ? 'passwords' : 'users');
  const refreshCounts = () => { void summary.reload(); summaryChanged(); };
  async function act(action: () => Promise<void>, success: string) {
    try { await action(); await result.reload(); setMessage(success); }
    catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Nie udało się wykonać operacji.'); }
  }
  async function inspect(userId: string) { try { setSelected({ userId, data: await api.adminUserData(userId) }); } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Nie udało się pobrać danych konta.'); } }
  async function refreshSelected() { if (selected) setSelected({ userId: selected.userId, data: await api.adminUserData(selected.userId) }); }
  async function inspectTraining(trainingId: string) { if (!selected) return; try { setSelectedTraining(await api.adminTraining(selected.userId, trainingId)); } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Nie udało się pobrać treningu.'); } }
  async function deleteTraining(trainingId: string) { if (!selected || !confirm('Usunąć ten trening bezpowrotnie? Historycznego treningu nie można później odzyskać.')) return; try { await api.adminDeleteTraining(selected.userId, trainingId); setSelectedTraining(undefined); await refreshSelected(); await result.reload(); setMessage('Trening został usunięty.'); } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Nie udało się usunąć treningu.'); } }
  async function itemAction(action: () => Promise<void>, success: string, destructive = false) { if (destructive && !confirm('Usunąć ten wpis? Będzie można go później odzyskać.')) return; try { await action(); await refreshSelected(); setMessage(success); } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Nie udało się wykonać operacji.'); } }
  async function renameUser(userId: string, oldName: string) { const username = prompt('Nowa nazwa konta:', oldName); if (username?.trim() && username !== oldName) await act(() => api.adminUpdateUser(userId, { username: username.trim() }), 'Nazwa konta została zmieniona.'); }
  function toggleAdmin(userId: string, username: string, isAdmin: boolean) {
    if (!confirm(isAdmin ? `Odebrać „${username}” rolę administratora? Jego weryfikacja dwuetapowa zostanie wyłączona.` : `Nadać „${username}” rolę administratora? Przy pierwszym wejściu do panelu ustawi weryfikację dwuetapową.`)) return;
    void act(() => api.adminSetRole(userId, !isAdmin), isAdmin ? 'Odebrano rolę administratora.' : 'Nadano rolę administratora.');
  }
  const tabs = <div className="segmented three" role="group" aria-label="Sekcja administracji">
    <button className={activeTab === 'users' ? 'active' : ''} onClick={() => setTab('users')}>Konta</button>
    <button className={activeTab === 'passwords' ? 'active' : ''} onClick={() => setTab('passwords')}>Hasła{pending > 0 && <span className="tab-badge" aria-label={`${pending} oczekujących`}>{pending}</span>}</button>
    <button className={activeTab === 'reports' ? 'active' : ''} onClick={() => setTab('reports')}>Zgłoszenia{newReports > 0 && <span className="tab-badge" aria-label={`${newReports} nowych`}>{newReports}</span>}</button>
  </div>;
  const status = <AdminTwoStepStatus recoveryCodesLeft={recoveryCodesLeft} onChanged={onTwoStepChanged}/>;
  if (activeTab === 'passwords') return <div className="page"><PageHeader title="Administracja" eyebrow="Prośby o reset hasła"/>{tabs}<AdminPasswordRequests onChanged={() => { refreshCounts(); void result.reload(); }}/>{status}</div>;
  if (activeTab === 'reports') return <div className="page"><PageHeader title="Administracja" eyebrow="Zgłoszenia problemów"/>{tabs}<AdminBugReports onChanged={refreshCounts}/>{status}</div>;
  if (result.loading) return <Loading/>;
  if (result.error) return <ErrorState message={result.error} retry={result.reload}/>;
  return <div className="page"><PageHeader title="Administracja" eyebrow="Konta użytkowników"/>{tabs}<p className="admin-notice">Administrator widzi ustawienia i liczniki kont, ale nigdy haseł, ocen ani komentarzy do treningów. Konta zakładają użytkownicy sami.</p><div className="search"><input aria-label="Szukaj kont" placeholder="Szukaj po nazwie konta" value={query} onChange={(e) => setQuery(e.target.value)}/></div>
    <div className="admin-users">{users.map((user) => <article key={user.id} className={user.deletedAt ? 'deleted' : ''}><div className="avatar small">{user.username[0]?.toUpperCase()}</div><div><h2>{user.username}</h2><p>{user.deletedAt ? 'Konto usunięte — można je odzyskać' : user.isAdmin ? 'Administrator' : 'Użytkownik'} · {user.elementCount ?? 0} elementów · {user.routineCount ?? 0} układów · {user.trainingCount ?? 0} treningów</p>{(!!user.pendingResetRequests || (user.isAdmin && !user.twoStepEnabled)) && <p className="user-flags">{!!user.pendingResetRequests && <button className="report-status new" onClick={() => setTab('passwords')}>prosi o reset hasła</button>}{user.isAdmin && !user.twoStepEnabled && <span className="report-status">bez weryfikacji dwuetapowej</span>}</p>}</div>
      <div className="admin-actions"><button onClick={() => void inspect(user.id)}>Dane konta</button>{user.deletedAt ? <button onClick={() => void act(() => api.adminRestoreUser(user.id), 'Konto zostało odzyskane.')}>Odzyskaj</button> : <><button onClick={() => void renameUser(user.id, user.username)}>Zmień nazwę</button><button disabled={user.id === currentUser.id} onClick={() => toggleAdmin(user.id, user.username, user.isAdmin)}>{user.isAdmin ? 'Odbierz admina' : 'Nadaj admina'}</button><button className="danger-link" disabled={user.id === currentUser.id} onClick={() => confirm(`Usunąć konto „${user.username}”? Będzie można je później odzyskać.`) && void act(() => api.adminDeleteUser(user.id), 'Konto zostało usunięte.')}>Usuń</button></>}</div></article>)}</div>
    {!users.length && <p className="chart-empty">Nie znaleziono kont.</p>}
    {status}
    {selected && <div className="modal-backdrop above"><section className="sheet wide"><PageHeader title="Dane konta" onBack={() => { setSelected(undefined); setSelectedTraining(undefined); }}/><div className="admin-data"><section><h2>Elementy</h2>{selected.data.elements.map((item) => <div key={item.id}><strong>{item.code}</strong><span>{item.name || 'Bez nazwy'}</span><button onClick={() => void itemAction(() => item.deletedAt ? api.adminRestoreElement(selected.userId, item.id) : api.adminDeleteElement(selected.userId, item.id), item.deletedAt ? 'Element odzyskano.' : 'Element usunięto.', !item.deletedAt)}>{item.deletedAt ? 'Odzyskaj' : 'Usuń'}</button></div>)}</section><section><h2>Układy</h2>{selected.data.routines.map((item) => <div key={item.id}><strong>{item.name}</strong><button onClick={() => void itemAction(() => item.deletedAt ? api.adminRestoreRoutine(selected.userId, item.id) : api.adminDeleteRoutine(selected.userId, item.id), item.deletedAt ? 'Układ odzyskano.' : 'Układ usunięto.', !item.deletedAt)}>{item.deletedAt ? 'Odzyskaj' : 'Usuń'}</button></div>)}</section><section><h2>Treningi</h2>{selected.data.trainings.map((item) => <div key={item.id}><strong>{item.date}</strong><button onClick={() => void inspectTraining(item.id)}>Podgląd</button><button className="danger-link" onClick={() => void deleteTraining(item.id)}>Usuń</button></div>)}{selectedTraining && <article className="admin-training-preview"><strong>{selectedTraining.date}</strong><span>{selectedTraining.entries.length} wejść · {selectedTraining.entries.reduce((sum, entry) => sum + entry.activities.reduce((activitySum, activity) => activitySum + activity.repetitions, 0), 0)} wykonań czynności</span>{selectedTraining.entries.map((entry, index) => <small key={entry.id ?? index}>Wejście {index + 1}: {entry.activities.map((activity) => activity.type === 'element' ? activity.elementCode : activity.routineName).join(', ') || 'bez czynności'}</small>)}</article>}</section></div></section></div>}
    {message && <Toast message={message} kind={message.includes('Nie udało') ? 'error' : 'success'} onClose={() => setMessage('')}/>}</div>;
}
