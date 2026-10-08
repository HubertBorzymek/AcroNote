import { recordRequest, type Diagnostics } from './diagnostics';
import type { Activity, AdminBugReport, AdminBugReportSummary, AdminUser, BugReportSummary, AdminUserData, CoachAthlete, CoachInvitation, CoachLink, ElementHistoryItem, ElementItem, ExecutionType, LandingCount, Routine, RoutineSlot, StatsSummary, Training, TrainingEntry, User } from './types';

export class ApiError extends Error {
  constructor(message: string, public status: number, public details?: unknown) {
    super(message);
  }
}

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body != null && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const method = init.method ?? 'GET';
  const started = performance.now();
  let response: Response;
  try {
    response = await fetch(`/api${path}`, { ...init, credentials: 'include', headers });
  } catch (reason) {
    recordRequest(method, path, 'network-error', performance.now() - started, reason instanceof Error ? reason.message : undefined);
    throw new ApiError('Brak połączenia z serwerem. Sprawdź internet i spróbuj ponownie.', 0);
  }
  const payload = response.status === 204 ? undefined : await response.json().catch(() => undefined);
  if (!response.ok) {
    const message = typeof payload === 'object' && payload && 'message' in payload
      ? String(payload.message)
      : 'Nie udało się wykonać operacji.';
    recordRequest(method, path, response.status, performance.now() - started, message);
    throw new ApiError(message, response.status, payload);
  }
  recordRequest(method, path, response.status, performance.now() - started);
  return payload as T;
}

const json = (body: unknown): RequestInit => ({ body: JSON.stringify(body) });
const id = (value: unknown) => value == null ? undefined : String(value);
const apiId = (value: string | undefined) => value && /^\d+$/.test(value) ? Number(value) : value || null;
const mapUser = (user: User & { id: unknown }): User => ({ ...user, id: String(user.id) });
const mapIds = <T extends { id: unknown }>(items: T[]) => items.map((item) => ({ ...item, id: String(item.id) }));
function landingCounts(value: unknown): LandingCount[] {
  if (Array.isArray(value)) return value.map((item) => ({ name: String(item.name ?? item.executionTypeName ?? item.landing ?? 'Inne'), count: Number(item.count ?? 0) }));
  if (value && typeof value === 'object') return Object.entries(value as Record<string, unknown>).map(([name, count]) => ({ name, count: Number(count) }));
  return [];
}

type RawRoutine = Omit<Routine, 'id' | 'slots'> & { id: unknown; items?: Array<Record<string, unknown>>; slots?: Array<Record<string, unknown>> };
function mapRoutine(raw: RawRoutine): Routine {
  return { ...raw, id: String(raw.id), slots: (raw.items ?? raw.slots ?? []).map((item, index): RoutineSlot => ({ id: id(item.id), elementId: id(item.elementId ?? item.sourceElementId) ?? '', position: Number(item.position ?? index + 1), code: item.code as string | undefined, name: item.name as string | null | undefined })) };
}
function routineBody(input: Pick<Routine, 'name' | 'slots'>) {
  return { name: input.name, items: input.slots.map((slot, index) => ({ elementId: apiId(slot.elementId), code: slot.code, name: slot.name ?? null, position: index + 1 })) };
}
function mapActivity(raw: Record<string, unknown>): Activity {
  const kind = (raw.kind ?? raw.type) as 'element' | 'routine';
  return {
    id: id(raw.id), type: kind, repetitions: Number(raw.repetitions ?? 1), executionTypeId: id(raw.executionTypeId), executionTypeName: String(raw.executionTypeName ?? ''),
    elementId: id(raw.sourceElementId ?? raw.elementId), elementCode: (raw.code ?? raw.elementCode) as string | undefined, elementName: (raw.name ?? raw.elementName) as string | null | undefined,
    routineId: id(raw.sourceRoutineId ?? raw.routineId), routineName: (raw.sourceRoutineName ?? raw.routineName) as string | undefined, sourceTemplateVersion: raw.sourceTemplateVersion as number | undefined, matchedOriginalTemplate: raw.matchedOriginalTemplate == null ? undefined : Boolean(raw.matchedOriginalTemplate), rangeStart: raw.rangeStart as number | undefined, rangeEnd: raw.rangeEnd as number | undefined,
    isFullRoutine: Boolean(raw.isFullRange ?? raw.isFullRoutine), elements: Array.isArray(raw.elements) ? raw.elements.map((item: Record<string, unknown>) => ({ elementId: id(item.sourceElementId ?? item.elementId), code: String(item.code), name: item.name as string | null | undefined, executionTypeId: id(item.executionTypeId), executionTypeName: String(item.executionTypeName ?? '') })) : undefined,
  };
}
function activityBody(activity: Activity) {
  const common = { kind: activity.type, repetitions: activity.repetitions, executionTypeId: apiId(activity.executionTypeId), executionTypeName: activity.executionTypeName };
  if (activity.type === 'element') return { ...common, sourceElementId: apiId(activity.elementId), code: activity.elementCode, name: activity.elementName ?? null };
  return { ...common, sourceRoutineId: apiId(activity.routineId), sourceRoutineName: activity.routineName, sourceTemplateVersion: activity.sourceTemplateVersion, rangeStart: activity.rangeStart, rangeEnd: activity.rangeEnd, isFullRange: activity.isFullRoutine,
    elements: activity.elements?.map((item, index) => ({ sourceElementId: apiId(item.elementId), code: item.code, name: item.name ?? null, executionTypeId: apiId(item.executionTypeId), executionTypeName: item.executionTypeName, position: index + 1 })) };
}
function trainingBody(input: Pick<Training, 'date' | 'entries'>) {
  return { date: input.date, entries: input.entries.map((entry) => ({ defaultExecutionTypeId: apiId(entry.defaultExecutionTypeId), defaultExecutionTypeName: entry.defaultExecutionTypeName, activities: entry.activities.map(activityBody) })) };
}
function mapTraining(raw: Record<string, unknown>): Training {
  const mapped = { ...(raw as unknown as Training), id: String(raw.id), date: String(raw.date), entries: ((raw.entries ?? []) as Array<Record<string, unknown>>).map((entry): TrainingEntry => ({ id: id(entry.id), defaultExecutionTypeId: id(entry.defaultExecutionTypeId), defaultExecutionTypeName: String(entry.defaultExecutionTypeName ?? ''), activities: ((entry.activities ?? []) as Array<Record<string, unknown>>).map(mapActivity) })) };
  if (raw.entriesCount != null || raw.totalElements != null) mapped.summary = { entries: Number(raw.entriesCount ?? 0), elements: Number(raw.totalElements ?? 0), fullRoutines: 0, fragments: 0, byCode: [] };
  return mapped;
}

export const api = {
  me: async () => mapUser(await request<User & { id: unknown }>('/auth/me')),
  login: async (username: string, password: string) => mapUser(await request<User & { id: unknown }>('/auth/login', { method: 'POST', ...json({ username, password }) })),
  register: async (username: string, password: string) => mapUser(await request<User & { id: unknown }>('/auth/register', { method: 'POST', ...json({ username, password }) })),
  logout: () => request<void>('/auth/logout', { method: 'POST' }),
  changePassword: (currentPassword: string, newPassword: string) => request<void>('/auth/password', { method: 'PUT', ...json({ currentPassword, newPassword }) }),
  updateProfiles: async (athleteEnabled: boolean, coachEnabled: boolean) => mapUser(await request<User & { id: unknown }>('/profile', { method: 'PUT', ...json({ athleteEnabled, coachEnabled }) })),

  elements: async (includeHidden = false) => (await request<Array<Omit<ElementItem, 'id'> & { id: unknown }>>(`/elements${includeHidden ? '?hidden=all' : ''}`)).map((item) => ({ ...item, id: String(item.id) })),
  createElement: async (input: Omit<ElementItem, 'id'>) => { const item = await request<Omit<ElementItem, 'id'> & { id: unknown }>('/elements', { method: 'POST', ...json(input) }); return { ...item, id: String(item.id) }; },
  updateElement: (elementId: string, input: Omit<ElementItem, 'id'>) => request<void>(`/elements/${elementId}`, { method: 'PUT', ...json(input) }),
  elementUsage: (elementId: string) => request<{ routineCount: number }>(`/elements/${elementId}/usage`),
  deleteElement: (id: string, removeFromRoutines = false) => request<void>(`/elements/${id}?routineHandling=${removeFromRoutines ? 'remove' : 'keep'}`, { method: 'DELETE' }),

  routines: async () => (await request<RawRoutine[]>('/routines')).map(mapRoutine),
  createRoutine: async (input: Pick<Routine, 'name' | 'slots'>) => mapRoutine(await request<RawRoutine>('/routines', { method: 'POST', ...json(routineBody(input)) })),
  updateRoutine: async (routineId: string, input: Pick<Routine, 'name' | 'slots'>) => mapRoutine(await request<RawRoutine>(`/routines/${routineId}`, { method: 'PUT', ...json(routineBody(input)) })),
  deleteRoutine: (id: string) => request<void>(`/routines/${id}`, { method: 'DELETE' }),

  executionTypes: async () => (await request<Array<Omit<ExecutionType, 'id'> & { id: unknown }>>('/execution-types')).map((item) => ({ ...item, id: String(item.id) })),
  createExecutionType: (name: string) => request<ExecutionType>('/execution-types', { method: 'POST', ...json({ name }) }),
  updateExecutionType: (item: ExecutionType) => request<void>(`/execution-types/${item.id}`, { method: 'PUT', ...json({ name: item.name, sortOrder: item.sortOrder ?? 0, hidden: !!item.hidden }) }),
  trainings: async (from?: string, to?: string) => (await request<Array<Record<string, unknown>>>(`/trainings?${new URLSearchParams({ ...(from && { from }), ...(to && { to }) })}`)).map(mapTraining),
  training: async (trainingId: string) => mapTraining(await request<Record<string, unknown>>(`/trainings/${trainingId}`)),
  createTraining: async (input: Pick<Training, 'date' | 'entries'>) => mapTraining(await request<Record<string, unknown>>('/trainings', { method: 'POST', ...json(trainingBody(input)) })),
  updateTraining: async (trainingId: string, input: Pick<Training, 'date' | 'entries'>) => mapTraining(await request<Record<string, unknown>>(`/trainings/${trainingId}`, { method: 'PUT', ...json(trainingBody(input)) })),
  deleteTraining: (id: string) => request<void>(`/trainings/${id}`, { method: 'DELETE' }),
  stats: async (from?: string, to?: string, elementId?: string) => {
    const raw = await request<Record<string, unknown>>(`/stats/summary?${new URLSearchParams({ ...(from && { from }), ...(to && { to }), ...(elementId && { elementId }) })}`);
    const byCode = raw.byCode as Record<string, number> | Array<{ code: string; count: number }> | undefined;
    return { entries: Number(raw.entries ?? raw.totalEntries ?? 0), elements: Number(raw.totalElements ?? raw.elements ?? 0), trainings: Number(raw.trainings ?? raw.trainingCount ?? 0), fullRoutines: Number(raw.fullRoutines ?? 0), fragments: Number(raw.fragments ?? raw.routineFragments ?? 0),
      byCode: Array.isArray(byCode) ? byCode : Object.entries(byCode ?? {}).map(([code, count]) => ({ code, count })).sort((a, b) => b.count - a.count),
      timeline: ((raw.timeline ?? []) as Array<Record<string, unknown>>).map((point) => ({ date: String(point.date), entries: Number(point.entries ?? 0), elements: Number(point.totalElements ?? point.elements ?? 0) })),
      byLanding: landingCounts(raw.byLanding ?? raw.landings),
      landingByCode: Array.isArray(raw.landingByCode) ? (raw.landingByCode as Array<Record<string, unknown>>).map((item) => ({ code: String(item.code), landings: landingCounts(item.landings ?? item.byLanding) })) : Object.entries((raw.landingByCode ?? {}) as Record<string, unknown>).map(([code, value]) => ({ code, landings: landingCounts(value) })) } satisfies StatsSummary;
  },
  invitations: async () => mapIds(await request<Array<CoachInvitation & { id: unknown }>>('/coach/invitations')),
  previewInvitation: (value: string) => request<{ id: number; role: 'athlete' | 'coach'; creatorUsername: string; expiresAt: string; requiredProfile: 'athlete' | 'coach' }>(`/coach/invitations/preview?${new URLSearchParams(value.length <= 12 ? { shortCode: value.toUpperCase() } : { token: value })}`),
  createInvitation: async (role: 'athlete' | 'coach', expiresInHours = 24) => { const item = await request<CoachInvitation & { id: unknown }>('/coach/invitations', { method: 'POST', ...json({ role, expiresInHours }) }); return { ...item, id: String(item.id) }; },
  acceptInvitation: (value: string) => request<void>('/coach/invitations/accept', { method: 'POST', ...json(value.length <= 12 ? { shortCode: value.toUpperCase() } : { token: value }) }),
  cancelInvitation: (invitationId: string) => request<void>(`/coach/invitations/${invitationId}`, { method: 'DELETE' }),
  coachAthletes: async () => mapIds(await request<Array<CoachAthlete & { id: unknown }>>('/coach/athletes')),
  athleteCoaches: async () => mapIds(await request<Array<CoachLink & { id: unknown }>>('/athlete/coaches')),
  disconnectAthlete: (athleteId: string) => request<void>(`/coach/links/${athleteId}`, { method: 'DELETE' }),
  disconnectCoach: (coachId: string) => request<void>(`/athlete/coaches/${coachId}`, { method: 'DELETE' }),
  coachAthlete: async (athleteId: string) => { const item = await request<CoachAthlete & { id: unknown }>(`/coach/athletes/${athleteId}`); return { ...item, id: String(item.id) }; },
  coachElements: async (athleteId: string) => mapIds(await request<Array<ElementItem & { id: unknown }>>(`/coach/athletes/${athleteId}/elements`)),
  coachExecutionTypes: async (athleteId: string) => mapIds(await request<Array<ExecutionType & { id: unknown }>>(`/coach/athletes/${athleteId}/execution-types`)),
  coachRoutines: async (athleteId: string) => (await request<RawRoutine[]>(`/coach/athletes/${athleteId}/routines`)).map(mapRoutine),
  coachTrainings: async (athleteId: string, from?: string, to?: string) => (await request<Array<Record<string, unknown>>>(`/coach/athletes/${athleteId}/trainings?${new URLSearchParams({ ...(from && { from }), ...(to && { to }) })}`)).map(mapTraining),
  coachTraining: async (athleteId: string, trainingId: string) => mapTraining(await request<Record<string, unknown>>(`/coach/athletes/${athleteId}/trainings/${trainingId}`)),
  coachStats: async (athleteId: string, from?: string, to?: string, elementId?: string) => {
    const raw = await request<Record<string, unknown>>(`/coach/athletes/${athleteId}/stats?${new URLSearchParams({ ...(from && { from }), ...(to && { to }), ...(elementId && { elementId }) })}`);
    const byCode = raw.byCode as Record<string, number> | Array<{ code: string; count: number }> | undefined;
    return { entries: Number(raw.entries ?? raw.totalEntries ?? 0), elements: Number(raw.totalElements ?? raw.elements ?? 0), trainings: Number(raw.trainings ?? raw.trainingCount ?? 0), fullRoutines: Number(raw.fullRoutines ?? 0), fragments: Number(raw.fragments ?? raw.routineFragments ?? 0), byCode: Array.isArray(byCode) ? byCode : Object.entries(byCode ?? {}).map(([code, count]) => ({ code, count })).sort((a, b) => b.count - a.count), timeline: ((raw.timeline ?? []) as Array<Record<string, unknown>>).map((point) => ({ date: String(point.date), entries: Number(point.entries ?? 0), elements: Number(point.totalElements ?? point.elements ?? 0) })), byLanding: landingCounts(raw.byLanding ?? raw.landings), landingByCode: Array.isArray(raw.landingByCode) ? (raw.landingByCode as Array<Record<string, unknown>>).map((item) => ({ code: String(item.code), landings: landingCounts(item.landings ?? item.byLanding) })) : Object.entries((raw.landingByCode ?? {}) as Record<string, unknown>).map(([code, value]) => ({ code, landings: landingCounts(value) })) } satisfies StatsSummary;
  },
  coachElementHistory: async (athleteId: string, elementId: string) => (await request<Array<Record<string, unknown>>>(`/coach/athletes/${athleteId}/elements/${elementId}/history`)).map((item): ElementHistoryItem => ({ trainingId: String(item.trainingId ?? item.id), date: String(item.date), count: Number(item.count ?? item.executions ?? 0), landings: landingCounts(item.landings ?? item.byLanding) })),
  adminUsers: async () => (await request<Array<AdminUser & { id: unknown; elementsCount?: number; routinesCount?: number; trainingsCount?: number }>>('/admin/users?includeDeleted=true')).map((user) => ({ ...user, id: String(user.id), isAdmin: user.role === 'admin', elementCount: user.elementsCount ?? user.elementCount, routineCount: user.routinesCount ?? user.routineCount, trainingCount: user.trainingsCount ?? user.trainingCount })),
  adminDeleteUser: (userId: string) => request<void>(`/admin/users/${userId}`, { method: 'DELETE' }),
  adminRestoreUser: (userId: string) => request<void>(`/admin/users/${userId}/restore`, { method: 'POST' }),
  adminSetRole: (userId: string, isAdmin: boolean) => request<void>(`/admin/users/${userId}`, { method: 'PUT', ...json({ role: isAdmin ? 'admin' : 'user' }) }),
  adminResetPassword: (userId: string, newPassword: string) => request<void>(`/admin/users/${userId}/reset-password`, { method: 'PUT', ...json({ newPassword }) }),
  adminCreateUser: (username: string, password: string, role: 'user' | 'admin' = 'user') => request<AdminUser>('/admin/users', { method: 'POST', ...json({ username, password, role, athleteEnabled: true }) }),
  adminUpdateUser: (userId: string, input: { username?: string; role?: 'user' | 'admin' }) => request<void>(`/admin/users/${userId}`, { method: 'PUT', ...json(input) }),
  adminUserData: async (userId: string) => { const data = await request<AdminUserData>(`/admin/users/${userId}/data`); return { elements: data.elements.map((x) => ({ ...x, id: String(x.id) })), routines: data.routines.map((x) => ({ ...x, id: String(x.id) })), trainings: data.trainings.map((x) => ({ ...x, id: String(x.id) })) }; },
  adminDeleteElement: (userId: string, elementId: string) => request<void>(`/admin/users/${userId}/elements/${elementId}`, { method: 'DELETE' }),
  adminRestoreElement: (userId: string, elementId: string) => request<void>(`/admin/users/${userId}/elements/${elementId}/restore`, { method: 'POST' }),
  adminDeleteRoutine: (userId: string, routineId: string) => request<void>(`/admin/users/${userId}/routines/${routineId}`, { method: 'DELETE' }),
  adminRestoreRoutine: (userId: string, routineId: string) => request<void>(`/admin/users/${userId}/routines/${routineId}/restore`, { method: 'POST' }),
  adminTraining: async (userId: string, trainingId: string) => mapTraining(await request<Record<string, unknown>>(`/admin/users/${userId}/trainings/${trainingId}`)),
  adminDeleteTraining: (userId: string, trainingId: string) => request<void>(`/admin/users/${userId}/trainings/${trainingId}`, { method: 'DELETE' }),

  sendBugReport: (input: { description: string; expected?: string; page: string; includeSnapshot: boolean; diagnostics: Diagnostics }) => request<{ id: number; status: 'new' }>('/bug-reports', { method: 'POST', ...json(input) }),
  myBugReports: () => request<BugReportSummary[]>('/bug-reports/mine'),
  adminBugReports: (status?: 'new' | 'resolved') => request<AdminBugReportSummary[]>(`/admin/bug-reports${status ? `?status=${status}` : ''}`),
  adminBugReport: (id: number) => request<AdminBugReport>(`/admin/bug-reports/${id}`),
  adminSetBugReportStatus: (id: number, status: 'new' | 'resolved') => request<void>(`/admin/bug-reports/${id}`, { method: 'PUT', ...json({ status }) }),
  adminDeleteBugReport: (id: number) => request<void>(`/admin/bug-reports/${id}`, { method: 'DELETE' }),
};
