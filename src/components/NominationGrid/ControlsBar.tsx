import { MenuItem, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { useTranslations } from 'next-intl';
import type { NominationDirection } from './types';
import WeekSelector from './WeekSelector';
import type { DateTime } from 'luxon';

interface ControlsBarProps {
  week: DateTime;
  onWeekChange: (value: DateTime) => void;
  direction: NominationDirection;
  onDirectionChange: (value: NominationDirection) => void;
  resolution: number;
  onResolutionChange: (value: number) => void;
}

const RESOLUTIONS = [5, 15, 30, 60];

export default function ControlsBar({
  week,
  onWeekChange,
  direction,
  onDirectionChange,
  resolution,
  onResolutionChange,
}: ControlsBarProps) {
  const t = useTranslations('grid');

  return (
    <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ xs: 'stretch', md: 'center' }}>
      <WeekSelector value={week} onChange={onWeekChange} />
      <Stack direction="row" spacing={1} alignItems="center">
        <Typography variant="subtitle2" color="text.secondary">
          {t('direction')}
        </Typography>
        <ToggleButtonGroup
          exclusive
          value={direction}
          onChange={(_, value: NominationDirection | null) => {
            if (value) onDirectionChange(value);
          }}
          size="small"
        >
          <ToggleButton value="entry">{t('entry')}</ToggleButton>
          <ToggleButton value="exit">{t('exit')}</ToggleButton>
        </ToggleButtonGroup>
      </Stack>
      <TextField
        select
        label={t('resolution')}
        value={resolution}
        onChange={(event) => onResolutionChange(Number(event.target.value))}
        sx={{ minWidth: 160 }}
      >
        {RESOLUTIONS.map((value) => (
          <MenuItem key={value} value={value}>
            {t('minutes', { count: value })}
          </MenuItem>
        ))}
      </TextField>
    </Stack>
  );
}
