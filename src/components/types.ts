import { DateTime } from 'luxon';

export type Direction = 'entry' | 'exit';

export type StepValue = number;

export interface PreviousNominationStep {
  startUTC: string;
  endUTC: string;
  value: StepValue;
}

export interface NominationStep {
  stepIndex: number;
  startLocal: string;
  endLocal: string;
  startUTC: string;
  endUTC: string;
  offsetMinutes: number;
  source: 'previous' | 'default' | 'user';
  value: StepValue;
  editable: boolean;
  dayIndex: number;
}

export interface NominationSubmission {
  weekStartLocalISO: string;
  direction: Direction;
  resolutionMinutes: number;
  steps: Array<Pick<NominationStep, 'startUTC' | 'endUTC' | 'value'>>;
}

export interface ValidationError {
  startUTC: string;
  endUTC: string;
  reason: 'NEGATIVE' | 'DECIMAL' | 'MAX' | 'NOT_NUMBER';
  value: string;
  maxValue: number;
}

export interface ValidationReport {
  errors: ValidationError[];
  isValid: boolean;
}

export interface NominationGridProps {
  weekAnchor: string;
  direction: Direction;
  resolutionMinutes: 5 | 15 | 30 | 60;
  unit?: 'kWh';
  maxValue?: number;
  fetchPreviousNomination?: (args: {
    direction: Direction;
    weekStartLocalISO: string;
    resolutionMinutes: number;
  }) => Promise<PreviousNominationStep[]>;
  onChange?: (payload: NominationSubmission) => void;
  onValidate?: (report: ValidationReport) => void;
  nowISO?: string;
}

export interface DayMetadata {
  dayIndex: number;
  localDateISO: string;
  label: string;
  gasDayStart: DateTime;
  gasDayEnd: DateTime;
}
