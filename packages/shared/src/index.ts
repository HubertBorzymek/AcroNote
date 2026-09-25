export type ProfileMode = 'athlete' | 'coach';
export type ActivityKind = 'element' | 'routine';

export interface ElementSnapshot {
  sourceElementId: number | null;
  code: string;
  name: string | null;
  executionTypeId: number | null;
  executionTypeName: string;
  position: number;
}

export interface RoutineActivityInput {
  kind: 'routine';
  sourceRoutineId: number | null;
  sourceRoutineName: string;
  rangeStart: number;
  rangeEnd: number;
  isFullRange: boolean;
  repetitions: number;
  executionTypeId: number | null;
  executionTypeName: string;
  elements: ElementSnapshot[];
}

export interface ElementActivityInput {
  kind: 'element';
  sourceElementId: number | null;
  code: string;
  name: string | null;
  repetitions: number;
  executionTypeId: number | null;
  executionTypeName: string;
}

export type ActivityInput = ElementActivityInput | RoutineActivityInput;
