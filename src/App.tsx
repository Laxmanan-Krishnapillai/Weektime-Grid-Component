import React, { useCallback, useMemo, useState } from 'react';
import { CssBaseline, Container, Divider, Stack, Typography } from '@mui/material';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { Toaster } from 'sonner';
import { DateTime } from 'luxon';
import {
  NominationGrid,
  NominationSubmission,
  PreviousNominationStep,
  ValidationReport,
} from './index';
import { TIME_ZONE } from './components/timeUtils';

function useWeekAnchor() {
  return useMemo(
    () =>
      DateTime.now()
        .setZone(TIME_ZONE)
        .toISO() ?? DateTime.now().toISO(),
    [],
  );
}

const theme = createTheme();

export default function App(): JSX.Element {
  const weekAnchor = useWeekAnchor();
  const [draft, setDraft] = useState<NominationSubmission | null>(null);
  const [validation, setValidation] = useState<ValidationReport | null>(null);

  const fetchPreviousNomination = useCallback(
    async ({ direction, resolutionMinutes }: {
      direction: 'entry' | 'exit';
      weekStartLocalISO: string;
      resolutionMinutes: number;
    }): Promise<PreviousNominationStep[]> => {
      console.info('Prefill requested', { direction, resolutionMinutes });
      await new Promise((resolve) => setTimeout(resolve, 300));
      return [];
    },
    [],
  );

  const handleChange = useCallback((payload: NominationSubmission) => {
    setDraft(payload);
  }, []);

  const handleValidate = useCallback((report: ValidationReport) => {
    setValidation(report);
  }, []);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Toaster richColors position="top-right" />
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Stack spacing={3}>
          <Stack spacing={1}>
            <Typography variant="h3" component="h1">
              Week Nomination Grid
            </Typography>
            <Typography color="text.secondary">
              This demo wires the NominationGrid component with mocked prefill, change, and validation
              handlers.
            </Typography>
          </Stack>
          <NominationGrid
            weekAnchor={weekAnchor}
            direction="entry"
            resolutionMinutes={60}
            fetchPreviousNomination={fetchPreviousNomination}
            onChange={handleChange}
            onValidate={handleValidate}
          />
          <Divider />
          <Stack spacing={2}>
            <Typography variant="h5" component="h2">
              Latest draft payload
            </Typography>
            <Typography component="pre" sx={{ overflow: 'auto', maxHeight: 320, bgcolor: 'grey.900', color: 'grey.100', p: 2, borderRadius: 2 }}>
              {draft ? JSON.stringify(draft, null, 2) : 'Interact with the grid to see nomination data.'}
            </Typography>
          </Stack>
          <Stack spacing={2}>
            <Typography variant="h5" component="h2">
              Validation status
            </Typography>
            <Typography component="pre" sx={{ overflow: 'auto', maxHeight: 320, bgcolor: 'grey.900', color: 'grey.100', p: 2, borderRadius: 2 }}>
              {validation ? JSON.stringify(validation, null, 2) : 'No validation feedback yet.'}
            </Typography>
          </Stack>
        </Stack>
      </Container>
    </ThemeProvider>
  );
}
