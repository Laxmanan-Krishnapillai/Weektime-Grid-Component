import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DataGridPremium,
  GridCellParams,
  GridColDef,
  GridColumnGroupingModel,
  GridPreProcessEditCellProps,
  GridRowsProp,
  GridValidRowModel,
} from '@mui/x-data-grid-premium';
import { Box, Tooltip, Typography } from '@mui/material';
import { DateTime } from 'luxon';
import { toast } from 'sonner';
import { useTranslations as useNextIntlTranslations } from 'next-intl';
import {
  type Direction,
  type NominationGridProps,
  type NominationStep,
  type NominationSubmission,
  type PreviousNominationStep,
  type ValidationError,
} from './types';
import { generateSteps, resolveWeekStart, TIME_ZONE } from './timeUtils';

const FALLBACK_MESSAGES: Record<string, string> = {
  'grid.labels.day': 'Day',
  'grid.labels.totalDay': 'Day total',
  'grid.labels.totalWeek': 'Weekly total',
  'grid.labels.steps': 'Time steps',
  'grid.labels.step': 'Step {index}',
  'grid.labels.week': 'Week {week}',
  'grid.errors.decimal': 'Decimals are not allowed.',
  'grid.errors.max': 'Value exceeds the maximum of {max}.',
  'grid.errors.notNumber': 'Enter a number.',
  'grid.errors.negative': 'Value must be greater than or equal to 0.',
  'grid.toasts.prefillError': 'failed to prefill nomination',
};

function formatTemplate(template: string, values?: Record<string, unknown>): string {
  if (!values) {
    return template;
  }
  return Object.keys(values).reduce((result, key) => {
    const pattern = new RegExp(`\\{${key}\\}`, 'g');
    return result.replace(pattern, String(values[key]));
  }, template);
}

function useSafeTranslations(namespace: string) {
  try {
    return useNextIntlTranslations(namespace);
  } catch {
    return ((key: string, values?: Record<string, unknown>) => {
      const fallback = FALLBACK_MESSAGES[`${namespace}.${key}`] ?? FALLBACK_MESSAGES[key] ?? key;
      return formatTemplate(fallback, values);
    }) as ReturnType<typeof useNextIntlTranslations>;
  }
}

function toISOOrThrow(date: DateTime): string {
  const iso = date.toISO();
  if (!iso) {
    throw new Error('Unable to serialise DateTime to ISO string.');
  }
  return iso;
}

interface GridRow extends GridValidRowModel {
  id: number;
  dayIndex: number;
  dayLabel: string;
  dayTotal: number;
  __steps: NominationStep[];
  __errorFlags: boolean[];
}

interface StepColumnMeta {
  field: string;
  stepIndex: number;
  headerName: string;
  headerDescription: string;
}

interface ParseResult {
  success: boolean;
  value?: number;
  error?: ValidationError;
}

const DEBOUNCE_MS = 300;
const STEP_FIELD_PREFIX = 'step-';

function parseStepIndex(field: string): number | null {
  if (!field.startsWith(STEP_FIELD_PREFIX)) {
    return null;
  }
  const raw = field.slice(STEP_FIELD_PREFIX.length);
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseInput(rawValue: unknown, step: NominationStep, maxValue: number): ParseResult {
  const valueString = typeof rawValue === 'number' ? String(rawValue) : String(rawValue ?? '').trim();
  if (valueString.length === 0) {
    return { success: true, value: 0 };
  }

  const compact = valueString.replace(/[\s_\u00A0]/g, '');
  const hasComma = compact.includes(',');
  const hasDot = compact.includes('.');

  if (hasComma && hasDot) {
    return {
      success: false,
      error: {
        startUTC: step.startUTC,
        endUTC: step.endUTC,
        reason: 'DECIMAL',
        value: valueString,
        maxValue,
      },
    };
  }

  let sanitized = compact;
  if (hasComma || hasDot) {
    const separator = hasComma ? ',' : '.';
    const [integerPart, decimalPart = ''] = sanitized.split(separator);
    if (decimalPart.length > 0 && Number(decimalPart) !== 0) {
      return {
        success: false,
        error: {
          startUTC: step.startUTC,
          endUTC: step.endUTC,
          reason: 'DECIMAL',
          value: valueString,
          maxValue,
        },
      };
    }
    sanitized = integerPart;
  }

  sanitized = sanitized.replace(/[.,]/g, '');

  if (!/^\d+$/.test(sanitized)) {
    return {
      success: false,
      error: {
        startUTC: step.startUTC,
        endUTC: step.endUTC,
        reason: 'NOT_NUMBER',
        value: valueString,
        maxValue,
      },
    };
  }

  const parsed = Number(sanitized);
  if (!Number.isFinite(parsed)) {
    return {
      success: false,
      error: {
        startUTC: step.startUTC,
        endUTC: step.endUTC,
        reason: 'NOT_NUMBER',
        value: valueString,
        maxValue,
      },
    };
  }

  if (parsed < 0) {
    return {
      success: false,
      error: {
        startUTC: step.startUTC,
        endUTC: step.endUTC,
        reason: 'NEGATIVE',
        value: valueString,
        maxValue,
      },
    };
  }

  return { success: true, value: parsed };
}

function computeValidation(steps: NominationStep[], maxValue: number): ValidationError[] {
  return steps
    .filter((step) => step.value > maxValue)
    .map<ValidationError>((step) => ({
      startUTC: step.startUTC,
      endUTC: step.endUTC,
      reason: 'MAX',
      value: String(step.value),
      maxValue,
    }));
}

function createSubmissionPayload(
  steps: NominationStep[],
  direction: Direction,
  resolutionMinutes: number,
  weekStartLocalISO: string,
): NominationSubmission {
  return {
    weekStartLocalISO,
    direction,
    resolutionMinutes,
    steps: steps.map((step) => ({
      startUTC: step.startUTC,
      endUTC: step.endUTC,
      value: step.value,
    })),
  };
}

function formatOffset(offsetMinutes: number): string {
  const hours = offsetMinutes / 60;
  const sign = hours >= 0 ? '+' : '-';
  const absolute = Math.abs(hours);
  const padded = absolute.toString().padStart(2, '0');
  return `${sign}${padded}`;
}

export const NominationGrid: React.FC<NominationGridProps> = ({
  weekAnchor,
  direction,
  resolutionMinutes,
  unit = 'kWh',
  maxValue = 100_000,
  fetchPreviousNomination,
  onChange,
  onValidate,
  nowISO,
}) => {
  const t = useSafeTranslations('grid');
  const numberFormatter = useMemo(() => new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }), []);
  const [previousSteps, setPreviousSteps] = useState<PreviousNominationStep[]>([]);
  const [steps, setSteps] = useState<NominationStep[]>([]);
  const [maxStepCount, setMaxStepCount] = useState(0);
  const [dayLabels, setDayLabels] = useState<string[]>([]);
  const [transientErrors, setTransientErrors] = useState<Map<string, ValidationError>>(new Map());

  const weekStartLocal = useMemo(() => resolveWeekStart(weekAnchor), [weekAnchor]);
  const weekStartLocalISO = useMemo(() => toISOOrThrow(weekStartLocal), [weekStartLocal]);
  const now = useMemo(
    () => (nowISO ? DateTime.fromISO(nowISO).setZone(TIME_ZONE) : DateTime.now().setZone(TIME_ZONE)),
    [nowISO],
  );

  useEffect(() => {
    let cancelled = false;
    async function loadPrefill() {
      if (!fetchPreviousNomination) {
        setPreviousSteps([]);
        return;
      }
      try {
        const results = await fetchPreviousNomination({
          direction,
          weekStartLocalISO,
          resolutionMinutes,
        });
        if (!cancelled) {
          setPreviousSteps(results ?? []);
        }
      } catch (error) {
        if (!cancelled) {
          setPreviousSteps([]);
          toast.error(t('toasts.prefillError'));
        }
      }
    }

    loadPrefill();
    return () => {
      cancelled = true;
    };
  }, [direction, fetchPreviousNomination, resolutionMinutes, t, weekStartLocalISO]);

  useEffect(() => {
    const generation = generateSteps({
      weekStartLocal,
      resolutionMinutes,
      previousSteps,
      now,
      maxValue,
    });
    setSteps(generation.steps);
    setMaxStepCount(generation.maxStepCount);
    setDayLabels(generation.dayMetadata.map((meta) => meta.label));
    setTransientErrors(new Map());
  }, [maxValue, now, previousSteps, resolutionMinutes, weekStartLocal]);

  const stepsByDay = useMemo(() => {
    const days: NominationStep[][] = Array.from({ length: 7 }, () => []);
    steps.forEach((step) => {
      if (!days[step.dayIndex]) {
        days[step.dayIndex] = [];
      }
      days[step.dayIndex].push(step);
    });
    return days.map((daySteps) => daySteps.slice().sort((a, b) => a.stepIndex - b.stepIndex));
  }, [steps]);

  const dayTotals = useMemo(
    () => stepsByDay.map((daySteps) => daySteps.reduce((total, step) => total + step.value, 0)),
    [stepsByDay],
  );

  const weekTotal = useMemo(() => dayTotals.reduce((total, value) => total + value, 0), [dayTotals]);

  const computedValidationErrors = useMemo(() => computeValidation(steps, maxValue), [steps, maxValue]);

  const combinedErrorMap = useMemo(() => {
    const map = new Map<string, ValidationError>();
    computedValidationErrors.forEach((error) => {
      map.set(error.startUTC, error);
    });
    Array.from(transientErrors.values()).forEach((error) => {
      map.set(error.startUTC, error);
    });
    return map;
  }, [computedValidationErrors, transientErrors]);

  const formatValidationError = useCallback(
    (error: ValidationError | undefined) => {
      if (!error) {
        return '';
      }
      switch (error.reason) {
        case 'DECIMAL':
          return t('errors.decimal');
        case 'NOT_NUMBER':
          return t('errors.notNumber');
        case 'NEGATIVE':
          return t('errors.negative');
        case 'MAX':
          return t('errors.max', { max: numberFormatter.format(error.maxValue) });
        default:
          return '';
      }
    },
    [numberFormatter, t],
  );

  useEffect(() => {
    if (!onValidate) {
      return;
    }
    const errors = Array.from(combinedErrorMap.values());
    onValidate({ errors, isValid: errors.length === 0 });
  }, [combinedErrorMap, onValidate]);

  useEffect(() => {
    if (!onChange) {
      return;
    }
    const handle = setTimeout(() => {
      onChange(
        createSubmissionPayload(
          steps,
          direction,
          resolutionMinutes,
          weekStartLocalISO,
        ),
      );
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(handle);
    };
  }, [direction, onChange, resolutionMinutes, steps, weekStartLocal, weekStartLocalISO]);

  const stepColumnsMeta: StepColumnMeta[] = useMemo(() => {
    const referenceDay = stepsByDay.find((daySteps) => daySteps.length > 0);
    return Array.from({ length: maxStepCount }).map((_, columnIndex) => {
      const sampleStep = steps.find((step) => step.stepIndex === columnIndex);
      const sampleLocal = sampleStep
        ? DateTime.fromISO(sampleStep.startLocal).setZone(TIME_ZONE)
        : referenceDay
          ? DateTime.fromISO(referenceDay[0].startLocal)
              .setZone(TIME_ZONE)
              .plus({ minutes: columnIndex * resolutionMinutes })
          : null;
      const headerName = sampleLocal ? sampleLocal.toFormat('HH:mm') : t('labels.step', { index: columnIndex + 1 });
      const headerDescription = sampleLocal
        ? `${sampleLocal.toFormat('HH:mm')} (${formatOffset(sampleLocal.offset)}) → ${sampleLocal
            .plus({ minutes: resolutionMinutes })
            .toFormat('HH:mm')} (${formatOffset(sampleLocal.plus({ minutes: resolutionMinutes }).offset)}) | UTC ${sampleLocal
            .toUTC()
            .toFormat('HH:mm')}`
        : headerName;
      return {
        field: `${STEP_FIELD_PREFIX}${columnIndex}`,
        stepIndex: columnIndex,
        headerName,
        headerDescription,
      };
    });
  }, [maxStepCount, resolutionMinutes, steps, stepsByDay, t]);

  const rows: GridRowsProp<GridRow> = useMemo(() => {
    return dayLabels.map((dayLabel, dayIndex) => {
      const daySteps = stepsByDay[dayIndex] ?? [];
      const errorFlags = stepColumnsMeta.map((meta) => {
        const step = daySteps[meta.stepIndex];
        return step ? combinedErrorMap.has(step.startUTC) : false;
      });
      const row: GridRow = {
        id: dayIndex,
        dayIndex,
        dayLabel,
        dayTotal: dayTotals[dayIndex] ?? 0,
        __steps: daySteps,
        __errorFlags: errorFlags,
      };
      stepColumnsMeta.forEach((meta) => {
        const step = daySteps[meta.stepIndex];
        row[meta.field] = step ? step.value : '';
      });
      return row;
    });
  }, [combinedErrorMap, dayLabels, dayTotals, stepColumnsMeta, stepsByDay]);

  const handleProcessRowUpdate = useCallback(
    (newRow: GridRow, oldRow: GridRow): GridRow => {
      const dayIndex = Number(newRow.id);
      if (!Number.isFinite(dayIndex)) {
        return oldRow;
      }

      const changedMeta = stepColumnsMeta.find((meta) => newRow[meta.field] !== oldRow[meta.field]);
      if (!changedMeta) {
        return oldRow;
      }

      const daySteps = stepsByDay[dayIndex] ?? [];
      const targetStep = daySteps.find((step) => step.stepIndex === changedMeta.stepIndex);
      if (!targetStep) {
        return oldRow;
      }

      const result = parseInput(newRow[changedMeta.field], targetStep, maxValue);
      if (!result.success || result.value === undefined) {
        setTransientErrors((prev) => {
          const next = new Map(prev);
          if (result.error) {
            next.set(targetStep.startUTC, result.error);
          }
          return next;
        });
        throw result.error ?? new Error('Invalid value');
      }

      setTransientErrors((prev) => {
        const next = new Map(prev);
        next.delete(targetStep.startUTC);
        return next;
      });

      setSteps((prev) =>
        prev.map((step) =>
          step.startUTC === targetStep.startUTC
            ? {
                ...step,
                value: result.value!,
                source: 'user',
              }
            : step,
        ),
      );

      return {
        ...newRow,
        [changedMeta.field]: result.value,
      };
    },
    [maxValue, stepColumnsMeta, stepsByDay],
  );

  const columns = useMemo<GridColDef<GridRow>[]>(() => {
    const baseColumns: GridColDef<GridRow>[] = [
      {
        field: 'dayLabel',
        headerName: t('labels.day'),
        width: 150,
        sortable: false,
        filterable: false,
        disableColumnMenu: true,
        editable: false,
      },
      {
        field: 'dayTotal',
        headerName: t('labels.totalDay'),
        width: 130,
        sortable: false,
        filterable: false,
        disableColumnMenu: true,
        valueFormatter: ({ value }) => numberFormatter.format(value as number),
        editable: false,
      },
    ];

    const timeColumns: GridColDef<GridRow>[] = stepColumnsMeta.map((meta) => ({
      field: meta.field,
      headerName: meta.headerName,
      description: meta.headerDescription,
      width: 110,
      sortable: false,
      filterable: false,
      disableColumnMenu: true,
      type: 'number',
      align: 'center',
      headerAlign: 'center',
      editable: true,
      preProcessEditCellProps: (params: GridPreProcessEditCellProps) => {
        const stepIndex = parseStepIndex(meta.field);
        if (stepIndex == null) {
          return params.props;
        }
        const dayIndex = Number(params.id);
        const step = stepsByDay[dayIndex]?.[stepIndex];
        if (!step) {
          return { ...params.props, error: true };
        }
        const parsed = parseInput(params.props.value, step, maxValue);
        return { ...params.props, error: !parsed.success };
      },
      renderCell: (params) => {
        const stepIndex = parseStepIndex(params.field);
        if (stepIndex == null) {
          return params.formattedValue;
        }
        const daySteps = params.row.__steps;
        const step = daySteps[stepIndex];
        if (!step) {
          return (
            <Typography variant="body2" color="text.disabled">
              --
            </Typography>
          );
        }
        const hasError = params.row.__errorFlags[stepIndex];
        const error = hasError ? combinedErrorMap.get(step.startUTC) : undefined;
        const isEditable = step.editable;
        const displayColor = hasError ? 'error.main' : isEditable ? 'text.primary' : 'text.disabled';
        const localStart = DateTime.fromISO(step.startLocal).setZone(TIME_ZONE);
        const localEnd = DateTime.fromISO(step.endLocal).setZone(TIME_ZONE);
        const scheduleTooltip = `${localStart.toFormat('ccc dd MMM HH:mm')} (${formatOffset(localStart.offset)}) → ${localEnd.toFormat('HH:mm')} (${formatOffset(localEnd.offset)})\nUTC ${localStart
          .toUTC()
          .toFormat('HH:mm')} → ${localEnd.toUTC().toFormat('HH:mm')}`;
        const tooltip = error
          ? `${formatValidationError(error)}\n${scheduleTooltip}`
          : scheduleTooltip;
        return (
          <Tooltip title={tooltip} placement="top" enterDelay={200} arrow>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '100%',
                height: '100%',
                bgcolor: hasError ? 'rgba(211, 47, 47, 0.08)' : undefined,
                borderRadius: 0,
              }}
            >
              <Typography variant="body2" color={displayColor} fontWeight={step.source === 'user' ? 600 : 400}>
                {numberFormatter.format(step.value)}
              </Typography>
            </Box>
          </Tooltip>
        );
      },
    }));

    return [...baseColumns, ...timeColumns];
  }, [combinedErrorMap, formatValidationError, maxValue, numberFormatter, stepColumnsMeta, stepsByDay, t]);

  const columnGroupingModel = useMemo<GridColumnGroupingModel>(
    () => [
      {
        groupId: 'timeSteps',
        headerName: t('labels.steps'),
        children: stepColumnsMeta.map((meta) => ({ field: meta.field })),
      },
    ],
    [stepColumnsMeta, t],
  );

  const isCellEditable = useCallback(
    (params: GridCellParams) => {
      const stepIndex = parseStepIndex(params.field);
      if (stepIndex == null) {
        return false;
      }
      const daySteps = stepsByDay[Number(params.id)] ?? [];
      const step = daySteps[stepIndex];
      return Boolean(step?.editable);
    },
    [stepsByDay],
  );

  const weekRangeLabel = useMemo(() => {
    const weekEnd = weekStartLocal.plus({ days: 6 });
    const startLabel = weekStartLocal.toFormat('dd MMM');
    const endLabel = weekEnd.toFormat('dd MMM yyyy');
    const weekNumber = weekStartLocal.weekNumber;
    return `${startLabel} → ${endLabel} (${t('labels.week', { week: weekNumber })})`;
  }, [t, weekStartLocal]);

    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, width: '100%' }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 2 }}>
          <Typography variant="h6">{weekRangeLabel}</Typography>
          <Typography variant="subtitle1">
            {t('labels.totalWeek')}: {numberFormatter.format(weekTotal)} {unit}
          </Typography>
        </Box>
        <DataGridPremium
          rows={rows}
          columns={columns}
          columnGroupingModel={columnGroupingModel}
          pinnedColumns={{ left: ['dayLabel', 'dayTotal'] }}
          disableRowSelectionOnClick
          hideFooter
          autoHeight
          density="compact"
          getRowHeight={() => 40}
          isCellEditable={isCellEditable}
          processRowUpdate={(newRow, oldRow) => handleProcessRowUpdate(newRow as GridRow, oldRow as GridRow)}
          onProcessRowUpdateError={() => {
            /* handled through transient errors */
          }}
          sx={{
            '& .MuiDataGrid-cell': {
              outline: 'none !important',
            },
            '& .MuiDataGrid-columnHeaderTitle': {
              whiteSpace: 'normal',
            },
          }}
        />
      </Box>
    );
};
