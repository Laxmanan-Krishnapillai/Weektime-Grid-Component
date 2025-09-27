import { DateTime } from 'luxon';
import type { DayDefinition, StepDefinition } from './types';

export const COPENHAGEN_ZONE = 'Europe/Copenhagen';

export function toWeekStart(date: DateTime): DateTime {
  const zoned = date.setZone(COPENHAGEN_ZONE);
  const isoWeekStart = zoned.startOf('week');
  return isoWeekStart.set({ hour: 0, minute: 0, second: 0, millisecond: 0 });
}

export function formatDayLabel(date: DateTime): string {
  return date.toFormat('ccc dd LLL');
}

export function formatHeaderLabel(step: DateTime): string {
  return step.toFormat('HH:mm');
}

export function formatTimezoneBadge(step: DateTime): string {
  const offset = step.toFormat('ZZ');
  return `${formatHeaderLabel(step)} (${offset})`;
}

export function buildWeekDays(
  weekStart: DateTime,
  resolutionMinutes: number,
  leadTimeHours: number,
  now: DateTime = DateTime.now().setZone(COPENHAGEN_ZONE),
): DayDefinition[] {
  const normalizedWeek = toWeekStart(weekStart);
  const startOfCurrentHour = now.endOf('hour');
  const cutoff = startOfCurrentHour.plus({ hours: leadTimeHours });

  let globalIndex = 0;
  const days: DayDefinition[] = [];

  for (let dayOffset = 0; dayOffset < 7; dayOffset += 1) {
    const dayDate = normalizedWeek.plus({ days: dayOffset });
    const gasDayStart = dayDate.set({ hour: 6, minute: 0, second: 0, millisecond: 0 });
    const gasDayEnd = gasDayStart.plus({ days: 1 });
    const steps: StepDefinition[] = [];

    let cursor = gasDayStart;
    let previousLabel: string | null = null;

    while (cursor < gasDayEnd) {
      const next = cursor.plus({ minutes: resolutionMinutes });
      const label = formatHeaderLabel(cursor);
      let timezoneLabel = label;
      if (label === previousLabel || cursor.offset !== next.offset) {
        timezoneLabel = `${label} (${cursor.toFormat('ZZ')})`;
      }

      const editable = next > cutoff;
      steps.push({
        g: globalIndex,
        labelLocal: label,
        timezoneLabel,
        startUTC: cursor.toUTC().toISO(),
        endUTC: next.toUTC().toISO(),
        editable,
        date: dayDate,
      });
      globalIndex += 1;
      previousLabel = label;
      cursor = next;
    }

    const editableDay = steps.some((step) => step.editable);
    days.push({
      date: dayDate,
      label: formatDayLabel(dayDate),
      editable: editableDay,
      steps,
    });
  }

  return days;
}

export function getTotalSteps(days: DayDefinition[]): number {
  return days.reduce((acc, day) => acc + day.steps.length, 0);
}
