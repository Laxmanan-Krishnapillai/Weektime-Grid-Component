import { DateTime, Duration } from 'luxon';
import type { DayMetadata, NominationStep, PreviousNominationStep } from './types';

export const TIME_ZONE = 'Europe/Copenhagen';
export const GAS_DAY_START_HOUR = 6;

export interface GenerateStepsParams {
  weekStartLocal: DateTime;
  resolutionMinutes: number;
  previousSteps: PreviousNominationStep[];
  now: DateTime;
  maxValue: number;
}

export interface GenerateStepsResult {
  dayMetadata: DayMetadata[];
  steps: NominationStep[];
  maxStepCount: number;
}

const resolutionOptions = [5, 15, 30, 60];

export function assertResolution(resolutionMinutes: number): void {
  if (!resolutionOptions.includes(resolutionMinutes)) {
    throw new Error(`Unsupported resolution: ${resolutionMinutes}`);
  }
}

export function resolveWeekStart(anchorISO: string): DateTime {
  const anchor = DateTime.fromISO(anchorISO, { zone: TIME_ZONE });
  if (!anchor.isValid) {
    throw new Error(`Invalid weekAnchor: ${anchorISO}`);
  }
  return anchor.startOf('week');
}

export function computeDayMetadata(weekStartLocal: DateTime): DayMetadata[] {
  return Array.from({ length: 7 }).map((_, dayIndex) => {
    const dayStart = weekStartLocal.plus({ days: dayIndex });
    const gasDayStart = dayStart.plus({ hours: GAS_DAY_START_HOUR });
    const gasDayEnd = gasDayStart.plus({ days: 1 });
    return {
      dayIndex,
      localDateISO: dayStart.toISODate(),
      label: gasDayStart.toFormat('ccc dd MMM'),
      gasDayStart,
      gasDayEnd,
    };
  });
}

export function buildBaselineMap(previousSteps: PreviousNominationStep[]): Map<string, PreviousNominationStep> {
  return new Map(previousSteps.map((step) => [`${step.startUTC}|${step.endUTC}`, step]));
}

function clamp(value: number, minValue: number, maxValue: number): number {
  return Math.min(Math.max(value, minValue), maxValue);
}

export function generateSteps({
  weekStartLocal,
  resolutionMinutes,
  previousSteps,
  now,
  maxValue,
}: GenerateStepsParams): GenerateStepsResult {
  assertResolution(resolutionMinutes);
  const baselineMap = buildBaselineMap(previousSteps);
  const resolution = Duration.fromObject({ minutes: resolutionMinutes });
  const dayMetadata = computeDayMetadata(weekStartLocal);
  const allSteps: NominationStep[] = [];

  let maxStepCount = 0;

  const nowLocal = now.setZone(TIME_ZONE);
  const cutoffLocal = nowLocal.startOf('hour').plus({ hours: 2 });
  const todayStart = nowLocal.startOf('day');

  dayMetadata.forEach(({ dayIndex, gasDayStart, gasDayEnd }) => {
    let cursor = gasDayStart;
    const daySteps: NominationStep[] = [];
    let stepIndex = 0;
    while (cursor < gasDayEnd) {
      const endLocal = cursor.plus(resolution);
      const startUTC = cursor.toUTC().toISO();
      const endUTC = endLocal.toUTC().toISO();
      const key = `${startUTC}|${endUTC}`;
      const baseline = baselineMap.get(key);
      const baselineValue = baseline?.value ?? 0;
      const value = clamp(baselineValue, 0, maxValue);
      const source: NominationStep['source'] = baseline ? 'previous' : 'default';
      let editable = true;
      if (gasDayStart < todayStart) {
        editable = false;
      } else if (gasDayStart < todayStart.plus({ days: 1 })) {
        editable = cursor >= cutoffLocal;
      }
      daySteps.push({
        stepIndex,
        startLocal: cursor.toISO(),
        endLocal: endLocal.toISO(),
        startUTC: startUTC!,
        endUTC: endUTC!,
        offsetMinutes: cursor.offset,
        source,
        value,
        editable,
        dayIndex,
      });
      cursor = endLocal;
      stepIndex += 1;
    }
    maxStepCount = Math.max(maxStepCount, daySteps.length);
    allSteps.push(...daySteps);
  });

  return {
    dayMetadata,
    steps: allSteps,
    maxStepCount,
  };
}

export function updateStepValue(step: NominationStep, newValue: number): NominationStep {
  return {
    ...step,
    value: clamp(newValue, 0, Number.MAX_SAFE_INTEGER),
    source: 'user',
  };
}
