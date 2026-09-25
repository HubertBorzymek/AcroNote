import type { Activity, ElementItem, ExecutionType, Routine, RoutineSlot, StatsSummary, Training, TrainingEntry, User } from './types';

export class ApiError extends Error {
  constructor(message: string, public status: number, public details?: unknown) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...init.headers },
  });
  const payload = response.status === 204 ? undefined : await response.json().catch(() => undefined);
  if (!response.ok) {
    const message = typeof payload === 'object' && payload && 'message' in payload
      ? String(payload.message)
      : 'Nie udało się wykonać operacji.';
    throw new ApiError(message, response.status, payload);
  }
  return payload as T;
}

const json = (body: unknown): RequestInit => ({ body: JSON.stringify(body) });
const id = (value: unknown) => value == null ? undefined : String(value);
const apiId = (value: string | undefined) => value && /^\d+$/.test(value) ? Number(value) : value ?? null;

type RawRoutine = Omit<Routine, 'id' | 'slots'> & { id: unknown; items?: Array<Record<string, unknown>>; slots?: Array<Record<string, unknown>> };
function mapRoutine(raw: RawRoutine): Routine {
  return { ...raw, id: String(raw.id), slots: (raw.items ?? raw.slots ?? []).map((item, index): RoutineSlot => ({ id: id(item.id), elementId: String(item.elementId ?? item.sourceElementId), position: Number(item.position ?? index + 1), code: item.code as string | undefined, name: item.name as string | null | undefined })) };
}
function routineBody(input: Pick<Routine, 'name' | 'slots'>) {
  return { name: input.name, items: input.slots.map((slot, index) => ({ elementId: apiId(slot.elementId), position: index + 1 })) };
}
function mapActivity(raw: Record<string, unknown>): Activity {
  const kind = (raw.kind ?? raw.type) as 'element' | 'routine';
  return {
    id: id(raw.id), type: kind, repetitions: Number(raw.repetitions ?? 1), executionTypeId: id(raw.executionTypeId), executionTypeName: String(raw.executionTypeName ?? ''),
    elementId: id(raw.sourceElementId ?? raw.elementId), elementCode: (raw.code ?? raw.elementCode) as string | undefined, elementName: (raw.name ?? raw.elementName) as string | null | undefined,
    routineId: id(raw.sourceRoutineId ?? raw.routineId), routineName: (raw.sourceRoutineName ?? raw.routineName) as string | undefined, rangeStart: raw.rangeStart as number | undefined, rangeEnd: raw.rangeEnd as number | undefined,
    isFullRoutine: Boolean(raw.isFullRange ?? raw.isFullRoutine), elements: Array.isArray(raw.elements) ? raw.elements.map((item: Record<string, unknown>) => ({ elementId: id(item.sourceElementId ?? item.elementId), code: String(item.code), name: item.name as string | null | undefined, executionTypeId: id(item.executionTypeId), executionTypeName: String(item.executionTypeName ?? '') })) : undefined,
  };
}
function activityBody(activity: Activity) {
  const common = { kind: activity.type, repetitions: activity.repetitions, executionTypeId: apiId(activity.executionTypeId), executionTypeName: activity.executionTypeName };
  if (activity.type === 'element') return { ...common, sourceElementId: apiId(activity.elementId), code: activity.elementCode, name: activity.elementName ?? null };
  return { ...common, sourceRoutineId: apiId(activity.routineId), sourceRoutineName: activity.routineName, rangeStart: activity.rangeStart, rangeEnd: activity.rangeEnd, isFullRange: activity.isFullRoutine,
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
  me: () => request<User>('/auth/me'),
  login: (username: string, password: string) => request<User>('/auth/login', { method: 'POST', ...json({ username, password }) }),
  register: (username: string, password: string) => request<User>('/auth/register', { method: 'POST', ...json({ username, password }) }),
  logout: () => request<void>('/auth/logout', { method: 'POST' }),
  changePassword: (currentPassword: string, newPassword: string) => request<void>('/auth/password', { method: 'PUT', ...json({ currentPassword, newPassword }) }),

  elements: async (includeHidden = false) => (await request<Array<Omit<ElementItem, 'id'> & { id: unknown }>>(`/elements${includeHidden ? '?hidden=all' : ''}`)).map((item) => ({ ...item, id: String(item.id) })),
  createElement: async (input: Omit<ElementItem, 'id'>) => { const item = await request<Omit<ElementItem, 'id'> & { id: unknown }>('/elements', { method: 'POST', ...json(input) }); return { ...item, id: String(item.id) }; },
  updateElement: async (elementId: string, input: Partial<ElementItem>) => { const item = await request<Omit<ElementItem, 'id'> & { id: unknown }>(`/elements/${elementId}`, { method: 'PUT', ...json(input) }); return { ...item, id: String(item.id) }; },
  deleteElement: (id: string, removeFromRoutines = false) => request<void>(`/elements/${id}?routineHandling=${removeFromRoutines ? 'remove' : 'keep'}`, { method: 'DELETE' }),

  routines: async () => (await request<RawRoutine[]>('/routines')).map(mapRoutine),
  createRoutine: async (input: Pick<Routine, 'name' | 'slots'>) => mapRoutine(await request<RawRoutine>('/routines', { method: 'POST', ...json(routineBody(input)) })),
  updateRoutine: async (routineId: string, input: Pick<Routine, 'name' | 'slots'>) => mapRoutine(await request<RawRoutine>(`/routines/${routineId}`, { method: 'PUT', ...json(routineBody(input)) })),
  deleteRoutine: (id: string) => request<void>(`/routines/${id}`, { method: 'DELETE' }),

  executionTypes: async () => (await request<Array<Omit<ExecutionType, 'id'> & { id: unknown }>>('/execution-types')).map((item) => ({ ...item, id: String(item.id) })),
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
      timeline: ((raw.timeline ?? []) as Array<Record<string, unknown>>).map((point) => ({ date: String(point.date), entries: Number(point.entries ?? 0), elements: Number(point.totalElements ?? point.elements ?? 0) })) } satisfies StatsSummary;
  },
};
