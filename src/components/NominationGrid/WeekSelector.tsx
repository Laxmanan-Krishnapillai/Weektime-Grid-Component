import { useMemo } from 'react';
import { DateTime } from 'luxon';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { useTranslations } from 'next-intl';
import { toWeekStart } from './time';

interface WeekSelectorProps {
  value: DateTime;
  onChange: (value: DateTime) => void;
}

export default function WeekSelector({ value, onChange }: WeekSelectorProps) {
  const t = useTranslations('grid');
  const weekLabel = useMemo(() => `W${value.weekNumber}`, [value.weekNumber]);

  return (
    <DatePicker<DateTime>
      label={`${t('weekLabel')} ${weekLabel}`}
      value={value}
      onChange={(nextValue, context) => {
        if (!nextValue || context?.validationError) return;
        onChange(toWeekStart(nextValue));
      }}
      views={["day"]}
      format="dd/LL/yyyy"
      slotProps={{
        textField: {
          helperText: t('gasDay'),
        },
      }}
    />
  );
}
