'use client';

import { useEffect, useMemo, useState } from 'react';
import { DateTime } from 'luxon';
import { Box, Button, Divider, Stack, Typography } from '@mui/material';
import { AdapterLuxon } from '@mui/x-date-pickers/AdapterLuxon';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { useQueryState } from 'nuqs';
import type { GridCellSelectionModel, GridCellIdentifier } from '@mui/x-data-grid-premium';
import GridView from './GridView';
import ControlsBar from './ControlsBar';
import TotalsFooter from './TotalsFooter';
import FillDialog from './FillDialog';
import type { NominationDirection, NominationSnapshot } from './types';
import { buildWeekDays, getTotalSteps, toWeekStart } from './time';
import { decodeDiff, diffParser, directionParser, encodeDiff, leadTimeParser, resolutionParser, weekParser } from './urlState';
import { parseIntegerValue } from './validation';

export interface NominationGridProps {
  leadTimeHours?: number;
  maxValue?: number;
  initialWeekStart?: DateTime;
  initialDirection?: NominationDirection;
  initialResolutionMinutes?: 5 | 15 | 30 | 60;
  onChange?: (snapshot: NominationSnapshot) => void;
}

const RESOLUTION_OPTIONS = [5, 15, 30, 60];

export default function NominationGrid({
  leadTimeHours = 2,
  maxValue = 100000,
  initialWeekStart = DateTime.now().setZone('Europe/Copenhagen').startOf('week'),
  initialDirection = 'entry',
  initialResolutionMinutes = 60,
  onChange,
}: NominationGridProps) {
  const t = useTranslations('grid');

  const normalizedWeek = useMemo(() => toWeekStart(initialWeekStart), [initialWeekStart]);
  const [weekQuery, setWeekQuery] = useQueryState('w', weekParser);
  const [directionQuery, setDirectionQuery] = useQueryState('dir', directionParser);
  const [resolutionQuery, setResolutionQuery] = useQueryState('r', resolutionParser);
  const [leadTimeQuery, setLeadTimeQuery] = useQueryState('lt', leadTimeParser);
  const [diffQuery, setDiffQuery] = useQueryState('d', diffParser);

  const week = weekQuery ?? normalizedWeek;
  const direction = directionQuery ?? initialDirection;
  const resolutionMinutes = resolutionQuery ?? initialResolutionMinutes;
  const effectiveLeadTime = leadTimeQuery ?? leadTimeHours;

  useEffect(() => {
    if (!RESOLUTION_OPTIONS.includes(resolutionMinutes)) {
      void setResolutionQuery(initialResolutionMinutes);
    }
  }, [resolutionMinutes, setResolutionQuery, initialResolutionMinutes]);

  useEffect(() => {
    if (!weekQuery) {
      void setWeekQuery(week);
    }
  }, [week, weekQuery, setWeekQuery]);

  useEffect(() => {
    if (!directionQuery) {
      void setDirectionQuery(direction);
    }
  }, [direction, directionQuery, setDirectionQuery]);

  useEffect(() => {
    if (!leadTimeQuery) {
      void setLeadTimeQuery(effectiveLeadTime);
    }
  }, [leadTimeQuery, setLeadTimeQuery, effectiveLeadTime]);

  const days = useMemo(
    () => buildWeekDays(week, resolutionMinutes, effectiveLeadTime),
    [week, resolutionMinutes, effectiveLeadTime],
  );
  const totalSteps = useMemo(() => getTotalSteps(days), [days]);

  const [values, setValues] = useState<number[]>(() => decodeDiff(diffQuery ?? null, totalSteps));

  useEffect(() => {
    setValues(decodeDiff(diffQuery ?? null, totalSteps));
  }, [diffQuery, totalSteps]);

  const [selectionModel, setSelectionModel] = useState<GridCellSelectionModel>({});
  const [fillDialogOpen, setFillDialogOpen] = useState(false);

  const selectedSteps = useMemo(() => {
    const indices = new Set<number>();
    Object.values(selectionModel).forEach((cells) => {
      cells?.forEach((cell) => {
        const identifier = cell as GridCellIdentifier;
        if (typeof identifier.field === 'string' && identifier.field.startsWith('step-')) {
          indices.add(Number(identifier.field.replace('step-', '')));
        }
      });
    });
    return Array.from(indices).sort((a, b) => a - b);
  }, [selectionModel]);

  const handleValueChange = (stepIndex: number, value: number) => {
    setValues((prev) => {
      const next = [...prev];
      if (stepIndex >= next.length) {
        return next;
      }
      next[stepIndex] = value;
      return next;
    });
  };

  const handleFillSelection = (value: number) => {
    if (selectedSteps.length === 0) {
      toast.info(t('noSelection'));
      return;
    }
    setValues((prev) => {
      const next = [...prev];
      selectedSteps.forEach((index) => {
        if (index < next.length) {
          next[index] = value;
        }
      });
      return next;
    });
    setFillDialogOpen(false);
  };

  useEffect(() => {
    const encoded = encodeDiff(values);
    if (encoded !== diffQuery) {
      void setDiffQuery(encoded ?? null);
    }
  }, [values, diffQuery, setDiffQuery]);

  const cutoffLabel = useMemo(() => {
    const now = DateTime.now().setZone('Europe/Copenhagen');
    const cutoff = now.endOf('hour').plus({ hours: effectiveLeadTime });
    return cutoff.toFormat('dd LLL yyyy HH:mm');
  }, [effectiveLeadTime]);

  useEffect(() => {
    if (!onChange) return;
    const snapshot: NominationSnapshot = {
      direction,
      resolutionMinutes,
      weekStartLocalISO: week.setZone('Europe/Copenhagen').toISO(),
      leadTimeHours: effectiveLeadTime,
      days: days.map((day) => {
        const steps = day.steps.map((step) => ({
          g: step.g,
          labelLocal: step.labelLocal,
          editable: step.editable,
          startUTC: step.startUTC,
          endUTC: step.endUTC,
          value: values[step.g] ?? 0,
          source: values[step.g] > 0 ? 'user' : 'baseline',
        }));
        const dayTotal = steps.reduce((acc, step) => acc + step.value, 0);
        return {
          dateLocalISO: day.date.toISODate() ?? '',
          editable: day.editable,
          dayTotal,
          steps,
        };
      }),
      weekTotal: values.reduce((acc, value) => acc + value, 0),
    };
    onChange(snapshot);
  }, [values, days, direction, resolutionMinutes, week, effectiveLeadTime, onChange]);

  const handleClipboardPaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      const tokens = text
        .split(/\s|;|,|\t/)
        .map((token) => token.trim())
        .filter(Boolean);
      if (tokens.length === 0) {
        toast.error(t('clipboardError'));
        return;
      }
      const parsedValues: number[] = [];
      for (const token of tokens) {
        const parsed = parseIntegerValue(token, maxValue);
        if (parsed === null) {
          toast.error(t('clipboardError'));
          return;
        }
        parsedValues.push(parsed);
      }
      setValues((prev) => {
        const next = [...prev];
        parsedValues.forEach((value, index) => {
          if (index < next.length) {
            next[index] = value;
          }
        });
        return next;
      });
    } catch (error) {
      toast.error(t('clipboardError'));
    }
  };

  return (
    <LocalizationProvider dateAdapter={AdapterLuxon} adapterLocale="en-gb">
      <Stack spacing={3}>
        <ControlsBar
          week={week}
          onWeekChange={(value) => void setWeekQuery(value)}
          direction={direction}
          onDirectionChange={(value) => void setDirectionQuery(value)}
          resolution={resolutionMinutes}
          onResolutionChange={(value) => void setResolutionQuery(value)}
        />
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ xs: 'flex-start', md: 'center' }}>
          <Typography variant="body2" color="text.secondary">
            {t('leadTimeNotice', { time: cutoffLabel, hours: effectiveLeadTime })}
          </Typography>
          <Button variant="outlined" onClick={() => setFillDialogOpen(true)} disabled={selectedSteps.length === 0}>
            {t('fill')}
          </Button>
          <Button variant="outlined" onClick={handleClipboardPaste}>
            {t('paste')}
          </Button>
        </Stack>
        <Box sx={{ overflowX: 'auto' }}>
          <GridView
            days={days}
            values={values}
            maxValue={maxValue}
            onValueChange={handleValueChange}
            cellSelectionModel={selectionModel}
            onCellSelectionChange={setSelectionModel}
          />
        </Box>
        <Divider />
        <TotalsFooter days={days} values={values} />
        <FillDialog
          open={fillDialogOpen}
          onClose={() => setFillDialogOpen(false)}
          onApply={handleFillSelection}
          maxValue={maxValue}
          selectionSize={selectedSteps.length}
        />
      </Stack>
    </LocalizationProvider>
  );
}
