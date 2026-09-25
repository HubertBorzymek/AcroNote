export type ID = string;

export interface User {
  id: ID;
  username: string;
  athleteProfile: boolean;
  coachProfile: boolean;
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
  updatedAt?: string;
}

export interface ActivityElement {
  elementId?: ID;
  code: string;
  name?: string | null;
  executionTypeId?: ID;
  executionTypeName: string;
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
  rangeStart?: number;
  rangeEnd?: number;
  isFullRoutine?: boolean;
  elements?: ActivityElement[];
}

export interface TrainingEntry {
  id?: ID;
  defaultExecutionTypeId?: ID;
  defaultExecutionTypeName: string;
  activities: Activity[];
}

export interface Training {
  id: ID;
  date: string;
  entries: TrainingEntry[];
  createdAt?: string;
  summary?: TrainingSummary;
}

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
}
