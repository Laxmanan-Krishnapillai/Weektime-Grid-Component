import { Card, CardContent, Divider, Stack, Typography } from '@mui/material';
import { useTranslations } from 'next-intl';
import type { DayDefinition } from './types';

interface TotalsFooterProps {
  days: DayDefinition[];
  values: number[];
}

export default function TotalsFooter({ days, values }: TotalsFooterProps) {
  const t = useTranslations('grid');

  const dayTotals = days.map((day) =>
    day.steps.reduce((total, step) => total + (values[step.g] ?? 0), 0),
  );
  const weekTotal = dayTotals.reduce((acc, total) => acc + total, 0);

  return (
    <Card variant="outlined">
      <CardContent>
        <Stack spacing={1}>
          <Typography variant="subtitle2">{t('totals')}</Typography>
          <Divider />
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} useFlexGap>
            {days.map((day, index) => (
              <Stack key={day.date.toISODate()} spacing={0.5} flex={1}>
                <Typography variant="body2" color="text.secondary">
                  {day.label}
                </Typography>
                <Typography variant="h6">{dayTotals[index].toLocaleString()}</Typography>
              </Stack>
            ))}
          </Stack>
          <Divider />
          <Stack direction="row" justifyContent="space-between">
            <Typography variant="body2" color="text.secondary">
              {t('weekTotal')}
            </Typography>
            <Typography variant="h6">{weekTotal.toLocaleString()}</Typography>
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
}
