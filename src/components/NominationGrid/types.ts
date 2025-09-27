import type { DateTime } from 'luxon';

export type NominationDirection = 'entry' | 'exit';

export interface StepDefinition {
  /** Global index across the week */
  g: number;
  labelLocal: string;
  timezoneLabel: string;
  startUTC: string;
  endUTC: string;
  editable: boolean;
  date: DateTime;
}

export interface DayDefinition {
  date: DateTime;
  label: string;
  editable: boolean;
  steps: StepDefinition[];
}

export interface GridStateValue {
  g: number;
  value: number;
}

export interface NominationSnapshot {
  direction: NominationDirection;
  resolutionMinutes: number;
  weekStartLocalISO: string;
  leadTimeHours: number;
  days: Array<{
    dateLocalISO: string;
    editable: boolean;
    dayTotal: number;
    steps: Array<{
      g: number;
      labelLocal: string;
      editable: boolean;
      startUTC: string;
      endUTC: string;
      value: number;
      source: 'user' | 'prefill' | 'baseline';
    }>;
  }>;
  weekTotal: number;
}

export interface BaselineValue {
  g: number;
  value: number;
  source: 'prefill' | 'baseline';
}

export type BaselinePayload = BaselineValue[];
