'use client';

import { Plus, Trash2 } from '@tuturuuu/icons';
import type { TopicAnnouncementImportRow } from '@tuturuuu/internal-api';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@tuturuuu/ui/table';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import type { ClipboardEvent } from 'react';
import { validateTopicAnnouncementImportRows } from './import-utils';
import { TopicAnnouncementsHelpTip } from './topic-announcements-help-tip';

export const BULK_IMPORT_MIN_ROWS = 8;

type ImportFieldKey = keyof TopicAnnouncementImportRow;
type ImportColumnLabelKey =
  | 'announcement_title'
  | 'classLabel'
  | 'contact_name'
  | 'day_label'
  | 'email'
  | 'endTime'
  | 'place'
  | 'room'
  | 'session_date'
  | 'startTime'
  | 'topic';
type PreviewRows = ReturnType<typeof validateTopicAnnouncementImportRows>;

const IMPORT_ERROR_LABEL_KEYS = {
  invalid_date: 'import_error_invalid_date',
  invalid_email: 'import_error_invalid_email',
  missing_email: 'import_error_missing_email',
  missing_topic: 'import_error_missing_topic',
} as const;

type ImportColumnHelpKey =
  | 'import_col_day_help'
  | 'import_col_class_help'
  | 'import_col_room_help'
  | 'import_col_date_help'
  | 'import_col_start_help'
  | 'import_col_end_help'
  | 'import_col_name_help'
  | 'import_col_email_help'
  | 'import_col_place_help'
  | 'import_col_topic_help'
  | 'import_col_title_help';

const GRID_COLUMNS: {
  className: string;
  helpKey: ImportColumnHelpKey;
  key: ImportFieldKey;
  labelKey: ImportColumnLabelKey;
  required?: boolean;
}[] = [
  {
    className: 'w-32',
    helpKey: 'import_col_day_help',
    key: 'dayLabel',
    labelKey: 'day_label',
  },
  {
    className: 'w-36',
    helpKey: 'import_col_class_help',
    key: 'classLabel',
    labelKey: 'classLabel',
  },
  {
    className: 'w-28',
    helpKey: 'import_col_room_help',
    key: 'room',
    labelKey: 'room',
  },
  {
    className: 'w-36',
    helpKey: 'import_col_date_help',
    key: 'sessionDate',
    labelKey: 'session_date',
  },
  {
    className: 'w-32',
    helpKey: 'import_col_start_help',
    key: 'startTime',
    labelKey: 'startTime',
  },
  {
    className: 'w-32',
    helpKey: 'import_col_end_help',
    key: 'endTime',
    labelKey: 'endTime',
  },
  {
    className: 'w-44',
    helpKey: 'import_col_name_help',
    key: 'contactName',
    labelKey: 'contact_name',
  },
  {
    className: 'w-56',
    helpKey: 'import_col_email_help',
    key: 'contactEmail',
    labelKey: 'email',
    required: true,
  },
  {
    className: 'w-44',
    helpKey: 'import_col_place_help',
    key: 'place',
    labelKey: 'place',
  },
  {
    className: 'w-64',
    helpKey: 'import_col_topic_help',
    key: 'topic',
    labelKey: 'topic',
    required: true,
  },
  {
    className: 'w-56',
    helpKey: 'import_col_title_help',
    key: 'title',
    labelKey: 'announcement_title',
  },
];

export function createEmptyImportRows(count = BULK_IMPORT_MIN_ROWS) {
  return Array.from({ length: count }, () => ({}));
}

export function hasImportRowContent(row: TopicAnnouncementImportRow) {
  return Object.values(row).some((value) => value?.trim());
}

export function padImportRows(rows: TopicAnnouncementImportRow[]) {
  const nextRows = rows.length > 0 ? rows : createEmptyImportRows();
  if (nextRows.length >= BULK_IMPORT_MIN_ROWS) return nextRows;

  return [
    ...nextRows,
    ...createEmptyImportRows(BULK_IMPORT_MIN_ROWS - nextRows.length),
  ];
}

export function previewEditableImportRows(rows: TopicAnnouncementImportRow[]) {
  return rows.map((row, index) => {
    if (!hasImportRowContent(row)) {
      return {
        errors: [],
        row,
        rowNumber: index + 1,
      };
    }

    const [preview] = validateTopicAnnouncementImportRows([row]);
    return {
      ...(preview ?? { errors: [], row }),
      rowNumber: index + 1,
    };
  });
}

function parseSpreadsheetPaste(value: string) {
  return value
    .replaceAll('\r\n', '\n')
    .replaceAll('\r', '\n')
    .split('\n')
    .filter((line, index, lines) => line.length > 0 || index < lines.length - 1)
    .map((line) => line.split('\t'));
}

export function BulkAnnouncementGrid({
  disabled,
  onRowsChange,
  previewRows,
  rows,
}: {
  disabled: boolean;
  onRowsChange: (rows: TopicAnnouncementImportRow[]) => void;
  previewRows: PreviewRows;
  rows: TopicAnnouncementImportRow[];
}) {
  const t = useTranslations('ws-topic-announcements');

  const updateCell = (rowIndex: number, key: ImportFieldKey, value: string) => {
    onRowsChange(
      rows.map((row, index) =>
        index === rowIndex
          ? {
              ...row,
              [key]: value || undefined,
            }
          : row
      )
    );
  };

  const handlePaste = (
    event: ClipboardEvent<HTMLInputElement>,
    rowIndex: number,
    columnIndex: number
  ) => {
    const value = event.clipboardData.getData('text');
    if (!(value.includes('\t') || value.includes('\n'))) return;

    event.preventDefault();
    const matrix = parseSpreadsheetPaste(value);
    const nextRows = [...rows];

    while (nextRows.length < rowIndex + matrix.length) {
      nextRows.push({});
    }

    matrix.forEach((cells, rowOffset) => {
      const targetIndex = rowIndex + rowOffset;
      const nextRow = { ...(nextRows[targetIndex] ?? {}) };

      cells.forEach((cellValue, cellOffset) => {
        const column = GRID_COLUMNS[columnIndex + cellOffset];
        if (!column) return;
        nextRow[column.key] = cellValue.trim() || undefined;
      });

      nextRows[targetIndex] = nextRow;
    });

    onRowsChange(padImportRows(nextRows));
  };

  const removeRow = (rowIndex: number) => {
    const nextRows = rows.filter((_, index) => index !== rowIndex);
    onRowsChange(padImportRows(nextRows));
  };

  return (
    <div className="overflow-hidden rounded-md border bg-background">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b p-3">
        <div>
          <h3 className="font-medium text-base">{t('bulk_editor_title')}</h3>
          <p className="text-muted-foreground text-sm">
            {t('bulk_editor_description')}
          </p>
        </div>
        <Button
          className="gap-2"
          disabled={disabled}
          onClick={() => onRowsChange([...rows, ...createEmptyImportRows(5)])}
          size="sm"
          type="button"
          variant="outline"
        >
          <Plus className="h-4 w-4" />
          {t('bulk_add_rows')}
        </Button>
      </div>

      <div className="max-h-[58vh] overflow-auto">
        <Table className="min-w-[1500px]">
          <TableHeader className="sticky top-0 z-10 bg-background">
            <TableRow>
              <TableHead className="w-14">#</TableHead>
              {GRID_COLUMNS.map((column) => (
                <TableHead className={column.className} key={column.key}>
                  <span className="inline-flex items-center gap-1">
                    {t(column.labelKey)}
                    {column.required ? (
                      <span className="text-dynamic-red">*</span>
                    ) : null}
                    <TopicAnnouncementsHelpTip label={t(column.helpKey)} />
                  </span>
                </TableHead>
              ))}
              <TableHead className="w-40">{t('status')}</TableHead>
              <TableHead className="w-14" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, rowIndex) => {
              const preview = previewRows[rowIndex];
              const hasContent = hasImportRowContent(row);

              return (
                <TableRow
                  className={cn(
                    hasContent &&
                      preview?.errors.length &&
                      'bg-dynamic-yellow/5'
                  )}
                  key={rowIndex}
                >
                  <TableCell className="text-muted-foreground">
                    {rowIndex + 1}
                  </TableCell>
                  {GRID_COLUMNS.map((column, columnIndex) => (
                    <TableCell className="p-1" key={column.key}>
                      <Input
                        aria-label={`${t(column.labelKey)} ${rowIndex + 1}`}
                        className="h-9 border-transparent bg-transparent shadow-none focus-visible:border-ring focus-visible:ring-1"
                        disabled={disabled}
                        onChange={(event) =>
                          updateCell(rowIndex, column.key, event.target.value)
                        }
                        onPaste={(event) =>
                          handlePaste(event, rowIndex, columnIndex)
                        }
                        type={column.key === 'sessionDate' ? 'date' : 'text'}
                        value={row[column.key] ?? ''}
                      />
                    </TableCell>
                  ))}
                  <TableCell>
                    {hasContent ? (
                      preview?.errors.length === 0 ? (
                        <Badge variant="success">{t('import_ready')}</Badge>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {preview?.errors.map((error) => (
                            <Badge key={error} variant="warning">
                              {t(IMPORT_ERROR_LABEL_KEYS[error])}
                            </Badge>
                          ))}
                        </div>
                      )
                    ) : (
                      <span className="text-muted-foreground text-sm">
                        {t('bulk_empty_row')}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="p-1">
                    <Button
                      aria-label={t('bulk_remove_row')}
                      disabled={disabled || rows.length <= 1}
                      onClick={() => removeRow(rowIndex)}
                      size="icon"
                      type="button"
                      variant="ghost"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
