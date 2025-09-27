import { useMemo } from 'react';
import {
  DataGridPremium,
  GridCellParams,
  GridCellSelectionModel,
  GridColDef,
  GridToolbarContainer,
} from '@mui/x-data-grid-premium';
import { Stack, Typography } from '@mui/material';
import { useTranslations } from 'next-intl';
import type { DayDefinition } from './types';
import { parseIntegerValue } from './validation';

interface GridViewProps {
  days: DayDefinition[];
  values: number[];
  maxValue: number;
  onValueChange: (stepIndex: number, value: number) => void;
  cellSelectionModel: GridCellSelectionModel;
  onCellSelectionChange: (model: GridCellSelectionModel) => void;
}

interface RowModel {
  id: string;
  day: string;
  [key: `step-${number}`]: number | string;
}

function HeaderCell({ label, timezoneLabel }: { label: string; timezoneLabel: string }) {
  return (
    <Stack spacing={0.5} alignItems="center">
      <Typography variant="body2" fontWeight={600}>
        {label}
      </Typography>
      {timezoneLabel !== label ? (
        <Typography variant="caption" color="text.secondary">
          {timezoneLabel}
        </Typography>
      ) : null}
    </Stack>
  );
}

function CustomToolbar() {
  return (
    <GridToolbarContainer>
      <Typography variant="subtitle2" sx={{ px: 1, py: 0.5 }}>
        Gas day 06:00 → 06:00 (Europe/Copenhagen)
      </Typography>
    </GridToolbarContainer>
  );
}

export default function GridView({
  days,
  values,
  maxValue,
  onValueChange,
  cellSelectionModel,
  onCellSelectionChange,
}: GridViewProps) {
  const t = useTranslations('grid');

  const columns: GridColDef<RowModel>[] = useMemo(() => {
    const dynamicColumns: GridColDef<RowModel>[] = [
      {
        field: 'day',
        headerName: t('day'),
        width: 130,
        sortable: false,
        filterable: false,
        pinnable: false,
        editable: false,
        renderCell: (params) => (
          <Stack>
            <Typography variant="body2" fontWeight={600}>
              {params.value}
            </Typography>
          </Stack>
        ),
      },
    ];

    days.forEach((day) => {
      day.steps.forEach((step) => {
        dynamicColumns.push({
          field: `step-${step.g}`,
          headerName: step.labelLocal,
          description: step.timezoneLabel,
          width: 110,
          type: 'number',
          editable: step.editable,
          align: 'center',
          headerAlign: 'center',
          renderHeader: () => <HeaderCell label={step.labelLocal} timezoneLabel={step.timezoneLabel} />,
          valueFormatter: (params) => (params.value as number | undefined)?.toLocaleString() ?? '0',
        });
      });
    });

    return dynamicColumns;
  }, [days, t]);

  const rows: RowModel[] = useMemo(
    () =>
      days.map((day) => {
        const base: RowModel = {
          id: day.date.toISODate() ?? day.label,
          day: day.label,
        };
        day.steps.forEach((step) => {
          base[`step-${step.g}`] = values[step.g] ?? 0;
        });
        return base;
      }),
    [days, values],
  );

  const handleCellEditCommit = (params: GridCellParams) => {
    if (!params.field.startsWith('step-')) return;
    const stepIndex = Number(params.field.replace('step-', ''));
    const parsed = parseIntegerValue(params.value, maxValue);
    if (parsed === null) {
      console.warn('Invalid value for step', stepIndex);
      return;
    }
    onValueChange(stepIndex, parsed);
  };

  return (
    <DataGridPremium
      autoHeight
      density="comfortable"
      rows={rows}
      columns={columns}
      hideFooter
      disableColumnMenu
      disableColumnReorder
      disableRowSelectionOnClick
      processRowUpdate={(newRow) => newRow}
      onCellEditCommit={handleCellEditCommit}
      cellSelectionModel={cellSelectionModel}
      onCellSelectionModelChange={onCellSelectionChange}
      slots={{ toolbar: CustomToolbar }}
      experimentalFeatures={{ ariaV7: true }}
    />
  );
}
