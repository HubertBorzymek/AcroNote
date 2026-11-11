export type ID = string;

export interface User {
  id: ID;
  username: string;
  athleteProfile?: boolean;
  coachProfile?: boolean;
  athleteEnabled?: boolean;
  coachEnabled?: boolean;
  isAdmin?: boolean;
  /** Password accepted; the session waits for the authenticator code (administrators). */
  mfaRequired?: boolean;
}

export interface AdminUser {
  id: ID;
  username: string;
  isAdmin: boolean;
  role?: 'user' | 'admin';
  deletedAt?: string | null;
  createdAt?: string;
  elementCount?: number;
  routineCount?: number;
  trainingCount?: number;
  pendingResetRequests?: number;
  twoStepEnabled?: boolean;
}

export interface AdminUserData {
  elements: Array<{ id: ID; code: string; name?: string | null; deletedAt?: string | null }>;
  routines: Array<{ id: ID; name: string; deletedAt?: string | null }>;
  trainings: Array<{ id: ID; date: string }>;
}

export interface ElementItem {
  id: ID;
  code: string;
  name?: string | null;
  favorite: boolean;
  hidden: boolean;
}

export interface ExecutionType {
  id: ID;
  name: string;
  hidden?: boolean;
  sortOrder?: number;
}

export interface RoutineSlot {
  id?: ID;
  elementId: ID;
  position: number;
  code?: string;
  name?: string | null;
}

export interface Routine {
  id: ID;
  name: string;
  slots: RoutineSlot[];
  templateVersion?: number;
  updatedAt?: string;
}

export interface ActivityElement {
  elementId?: ID;
  code: string;
  name?: string | null;
  executionTypeId?: ID;
  executionTypeName: string;
  /** Time of this element in milliseconds (only for a single execution). */
  timeMs?: number | null;
}

export interface Activity {
  id?: ID;
  type: 'element' | 'routine';
  repetitions: number;
  executionTypeId?: ID;
  executionTypeName: string;
  elementId?: ID;
  elementCode?: string;
  elementName?: string | null;
  routineId?: ID;
  routineName?: string;
  sourceTemplateVersion?: number;
  matchedOriginalTemplate?: boolean;
  rangeStart?: number;
  rangeEnd?: number;
  isFullRoutine?: boolean;
  elements?: ActivityElement[];
  /** Time of a single execution in milliseconds: the element, or the whole routine/fragment. */
  timeMs?: number | null;
}

export interface TrainingEntry {
  id?: ID;
  defaultExecutionTypeId?: ID;
  defaultExecutionTypeName: string;
  activities: Activity[];
  /** Client-only key for list rendering and the collapsed state; never sent to the API. */
  clientKey?: string;
}

export interface Training {
  id: ID;
  date: string;
  entries: TrainingEntry[];
  createdAt?: string;
  summary?: TrainingSummary;
  /** Private to the athlete (1-10); coaches and administrators never receive it. */
  rating?: number | null;
  comment?: string | null;
  /** Returned after saving: times that beat the athlete's earlier best. */
  newRecords?: TimeRecord[];
}

export interface TimeRecord { key: string; kind: 'element' | 'routine'; label: string; timeMs: number; previousMs: number }

export interface TimeStatsItem {
  key: string; kind: 'element' | 'routine'; label: string; count: number;
  bestMs: number; bestDate: string; avgMs: number; lastMs: number; lastDate: string;
  recentAvgMs: number | null; earlierAvgMs: number | null; trendMs: number | null;
  series: Array<{ trainingId: number; date: string; count: number; bestMs: number; worstMs: number; avgMs: number }>;
}

export interface TimeStats { recentDays: number; items: TimeStatsItem[] }

export interface TrainingSummary {
  entries: number;
  elements: number;
  fullRoutines: number;
  fragments: number;
  byCode: Array<{ code: string; count: number }>;
}

export interface StatsPoint {
  date: string;
  entries: number;
  elements: number;
}

export interface StatsSummary {
  entries: number;
  elements: number;
  trainings: number;
  fullRoutines: number;
  fragments: number;
  byCode: Array<{ code: string; count: number }>;
  timeline: StatsPoint[];
  byLanding: LandingCount[];
  landingByCode: Array<{ code: string; landings: LandingCount[] }>;
}

export interface LandingCount { name: string; count: number }

export interface CoachAthlete {
  id: ID;
  username: string;
  connectedAt?: string;
}

export interface CoachLink {
  id: ID;
  username: string;
  connectedAt?: string;
}

export interface CoachInvitation {
  id: ID;
  role: 'athlete' | 'coach';
  token?: string;
  shortCode?: string;
  path?: string;
  url?: string;
  qrDataUrl?: string;
  expiresAt: string;
  createdAt: string;
  status: 'pending' | 'accepted' | 'cancelled' | 'expired';
}

export interface ElementHistoryItem {
  trainingId: ID;
  date: string;
  count: number;
  landings?: LandingCount[];
}

export interface BugReportSummary {
  id: number;
  description: string;
  status: 'new' | 'resolved';
  createdAt: string;
  resolvedAt?: string | null;
}

export interface AdminBugReportSummary extends BugReportSummary {
  userId: number | null;
  username: string;
  page: string | null;
  appVersion: string | null;
  hasSnapshot: number | boolean;
}

export interface AdminBugReport extends Omit<AdminBugReportSummary, 'hasSnapshot'> {
  expected: string | null;
  userAgent: string | null;
  diagnostics: Record<string, unknown> | null;
  dataSnapshot: Record<string, unknown> | null;
}

export interface PasswordResetRequest {
  id: number;
  userId: number;
  username: string;
  requestNumber: string;
  message: string | null;
  status: 'pending' | 'approved' | 'done' | 'rejected' | 'cancelled' | 'expired';
  createdAt: string;
  handledAt: string | null;
  approvalExpiresAt: string | null;
  repeatCount: number;
}

/** State of this device's own "forgot password" request. */
export interface OwnPasswordReset {
  status: 'none' | PasswordResetRequest['status'];
  requestNumber?: string;
  username?: string;
}

export interface AdminSummary { pendingResets: number; newBugReports: number }

export interface TwoStepSetup { secret: string; uri: string; qrDataUrl: string }
