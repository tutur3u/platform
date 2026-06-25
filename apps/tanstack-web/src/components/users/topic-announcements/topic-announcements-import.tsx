'use client';

import { Send, Upload } from '@tuturuuu/icons';
import type {
  TopicAnnouncementImportPayload,
  TopicAnnouncementImportResult,
  TopicAnnouncementImportRow,
} from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import { XLSX } from '@tuturuuu/ui/xlsx';
import { useTranslations } from 'next-intl';
import type { ChangeEvent } from 'react';
import { useMemo, useState } from 'react';
import {
  parseTopicAnnouncementCsv,
  parseTopicAnnouncementRowsFromMatrix,
  TOPIC_ANNOUNCEMENT_IMPORT_COLUMNS,
} from './import-utils';
import { TopicAnnouncementsHelpTip } from './topic-announcements-help-tip';
import {
  BulkAnnouncementGrid,
  createEmptyImportRows,
  hasImportRowContent,
  padImportRows,
  previewEditableImportRows,
} from './topic-announcements-import-grid';
import { ImportSourcePanel } from './topic-announcements-import-source-panel';
import { ImportSummary } from './topic-announcements-import-summary';

export const BULK_SEND_LIMIT = 50;
export const IMPORT_ROWS_LIMIT = 500;
export const SOURCE_NAME_LIMIT = 200;

interface ImportPanelProps {
  canSend: boolean;
  importResult: TopicAnnouncementImportResult | null;
  isImporting: boolean;
  isSending: boolean;
  onImport: (payload: TopicAnnouncementImportPayload) => void;
  onImportAndSend: (payload: TopicAnnouncementImportPayload) => void;
}

function downloadBlob(blob: Blob, filename: string) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
}

export function downloadTopicAnnouncementTemplate() {
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(
    [
      {
        class: 'EGET1',
        date: '2026-06-01',
        day: 'Monday',
        email: 'teacher@example.com',
        'end time': '18:00',
        place: 'Center 1',
        room: 'A201',
        'start time': '17:00',
        teacher: 'Teacher Name',
        title: 'Unit 3 speaking practice',
        topic: 'Unit 3 speaking practice',
      },
    ],
    { header: [...TOPIC_ANNOUNCEMENT_IMPORT_COLUMNS] }
  );

  XLSX.utils.book_append_sheet(workbook, worksheet, 'Announcements');
  const excelBuffer = XLSX.write(workbook, {
    bookType: 'xlsx',
    type: 'array',
  });
  downloadBlob(
    new Blob([excelBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    'topic-announcements-template.xlsx'
  );
}

async function parseWorkbook(file: File) {
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) return [];

  const sheet = workbook.Sheets[firstSheetName];
  if (!sheet) return [];

  const rows = XLSX.utils.sheet_to_json(sheet, {
    defval: '',
    header: 1,
    raw: false,
  }) as unknown[][];

  return parseTopicAnnouncementRowsFromMatrix(rows);
}

export function buildImportPayload(
  rows: TopicAnnouncementImportRow[],
  sourceName: string
): TopicAnnouncementImportPayload {
  const normalizedSourceName = sourceName.trim();

  return {
    rows: rows.map(normalizeImportRow),
    sourceName: normalizedSourceName || undefined,
    sourceType: 'foreign_teacher_schedule',
  };
}

function normalizeImportRow(row: TopicAnnouncementImportRow) {
  const normalizedRow: TopicAnnouncementImportRow = {};

  for (const [key, value] of Object.entries(row) as [
    keyof TopicAnnouncementImportRow,
    string | undefined,
  ][]) {
    const trimmed = value?.trim();
    if (!trimmed) continue;
    normalizedRow[key] =
      key === 'contactEmail' ? trimmed.toLowerCase() : trimmed;
  }

  return normalizedRow;
}

export function getImportPanelRowState(rows: TopicAnnouncementImportRow[]) {
  const previewRows = previewEditableImportRows(rows);
  const filledRows = previewRows.filter((preview) =>
    hasImportRowContent(preview.row)
  );
  const validRows = filledRows
    .filter((preview) => preview.errors.length === 0)
    .map((preview) => preview.row);
  const invalidCount = filledRows.length - validRows.length;

  return {
    filledRows,
    invalidCount,
    previewRows,
    sendTooLarge: validRows.length > BULK_SEND_LIMIT,
    tooManyRows: validRows.length > IMPORT_ROWS_LIMIT,
    validRows,
  };
}

export function ImportPanel({
  canSend,
  importResult,
  isImporting,
  isSending,
  onImport,
  onImportAndSend,
}: ImportPanelProps) {
  const t = useTranslations('ws-topic-announcements');
  const [sourceName, setSourceName] = useState('');
  const [csv, setCsv] = useState('');
  const [fileName, setFileName] = useState('');
  const [fileError, setFileError] = useState<string | null>(null);
  const [rows, setRows] = useState<TopicAnnouncementImportRow[]>(
    createEmptyImportRows()
  );
  const {
    filledRows,
    invalidCount,
    previewRows,
    sendTooLarge,
    tooManyRows,
    validRows,
  } = useMemo(() => getImportPanelRowState(rows), [rows]);
  const sourceNameTooLong = sourceName.trim().length > SOURCE_NAME_LIMIT;
  const isBusy = isImporting || isSending;
  const importDisabled =
    isBusy || sourceNameTooLong || tooManyRows || validRows.length === 0;

  const loadRows = (nextRows: TopicAnnouncementImportRow[]) => {
    setRows(padImportRows(nextRows));
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setFileError(null);
      const parsedRows = await parseWorkbook(file);
      setFileName(file.name);
      setCsv('');
      loadRows(parsedRows);
    } catch {
      setFileName('');
      setFileError(t('import_file_failed'));
    }
  };

  const loadCsvRows = () => {
    const csvRows = parseTopicAnnouncementCsv(csv);
    setFileName('');
    loadRows(csvRows);
  };

  const resetRows = () => {
    setCsv('');
    setFileName('');
    setFileError(null);
    setRows(createEmptyImportRows());
  };

  return (
    <div className="space-y-4">
      <ImportSourcePanel
        csv={csv}
        fileError={fileError}
        fileName={fileName}
        isBusy={isBusy}
        onCsvChange={setCsv}
        onDownloadTemplate={downloadTopicAnnouncementTemplate}
        onFileChange={(event) => void handleFileChange(event)}
        onLoadCsv={loadCsvRows}
        onResetRows={resetRows}
        onSourceNameChange={setSourceName}
        sourceName={sourceName}
      />

      <BulkAnnouncementGrid
        disabled={isBusy}
        onRowsChange={setRows}
        previewRows={previewRows}
        rows={rows}
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
        <ImportSummary
          importResult={importResult}
          invalidCount={invalidCount}
          rowCount={filledRows.length}
          validCount={validRows.length}
        />

        <div className="flex flex-col justify-end gap-2 sm:flex-row lg:flex-col">
          <div className="flex items-center justify-end gap-1.5">
            <Button
              className="gap-2"
              disabled={importDisabled}
              onClick={() =>
                onImport(buildImportPayload(validRows, sourceName))
              }
              type="button"
              variant="outline"
            >
              <Upload className="h-4 w-4" />
              {t('bulk_create_drafts')}
            </Button>
            <TopicAnnouncementsHelpTip label={t('bulk_create_drafts_help')} />
          </div>
          <div className="flex items-center justify-end gap-1.5">
            <Button
              className="gap-2"
              disabled={!canSend || importDisabled || sendTooLarge}
              onClick={() =>
                onImportAndSend(buildImportPayload(validRows, sourceName))
              }
              type="button"
            >
              <Send className="h-4 w-4" />
              {t('bulk_create_and_send')}
            </Button>
            <TopicAnnouncementsHelpTip label={t('bulk_create_and_send_help')} />
          </div>
          {sendTooLarge ? (
            <p className="max-w-80 text-muted-foreground text-xs">
              {t('bulk_send_limit', {
                count: BULK_SEND_LIMIT.toString(),
              })}
            </p>
          ) : null}
          {tooManyRows ? (
            <p className="max-w-80 text-muted-foreground text-xs">
              {t('import_error_too_many_rows', {
                count: IMPORT_ROWS_LIMIT.toString(),
              })}
            </p>
          ) : null}
          {sourceNameTooLong ? (
            <p className="max-w-80 text-muted-foreground text-xs">
              {t('import_error_source_name_too_long', {
                count: SOURCE_NAME_LIMIT.toString(),
              })}
            </p>
          ) : null}
          {!canSend ? (
            <p className="max-w-80 text-muted-foreground text-xs">
              {t('bulk_send_permission_required')}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
