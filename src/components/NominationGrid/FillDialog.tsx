import { useState } from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Stack,
  TextField,
} from '@mui/material';
import { useTranslations } from 'next-intl';
import { parseIntegerValue } from './validation';

interface FillDialogProps {
  open: boolean;
  maxValue: number;
  onClose: () => void;
  onApply: (value: number) => void;
  selectionSize: number;
}

export default function FillDialog({ open, onClose, onApply, maxValue, selectionSize }: FillDialogProps) {
  const t = useTranslations('grid');
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleApply = () => {
    const parsed = parseIntegerValue(input, maxValue);
    if (parsed === null) {
      setError(t('invalidValue', { max: maxValue }));
      return;
    }
    setError(null);
    onApply(parsed);
    setInput('');
  };

  const handleClose = () => {
    setInput('');
    setError(null);
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth>
      <DialogTitle>{t('fillSelection')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          <DialogContentText>
            {selectionSize > 0 ? t('fill') : t('noSelection')}
          </DialogContentText>
          <TextField
            label={t('fillValueLabel')}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            error={Boolean(error)}
            helperText={error ?? ''}
            inputProps={{ inputMode: 'numeric', pattern: '[0-9]*' }}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>{t('fillCancel')}</Button>
        <Button onClick={handleApply} disabled={selectionSize === 0} variant="contained">
          {t('fillApply')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
