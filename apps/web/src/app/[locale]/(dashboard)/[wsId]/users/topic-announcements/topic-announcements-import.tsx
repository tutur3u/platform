'use client';

import { AlertCircle, CheckCircle2, Download, Upload } from '@tuturuuu/icons';
import type {
  TopicAnnouncementImportPayload,
  TopicAnnouncementImportRow,
} from '@tuturuuu/internal-api';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { Separator } from '@tuturuuu/ui/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@tuturuuu/ui/table';
import { Textarea } from '@tuturuuu/ui/textarea';
import { XLSX } from '@tuturuuu/ui/xlsx';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import {
  parseTopicAnnouncementCsv,
  parseTopicAnnouncementRowsFromMatrix,
  TOPIC_ANNOUNCEMENT_IMPORT_COLUMNS,
  validateTopicAnnouncementImportRows,
} from './import-utils';

interface ImportResult {
  batchId?: string;
  createdAnnouncements: number;
  createdContacts: number;
  rowErrors: { message: string; rowNumber: number }[];
}

interface Props {
  importResult: ImportResult | null;
  isImporting: boolean;
  onImport: (payload: TopicAnnouncementImportPayload) => void;
}

const IMPORT_ERROR_LABEL_KEYS = {
  missing_email: 'import_error_missing_email',
  missing_topic: 'import_error_missing_topic',
} as const;

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

export function ImportPanel({ importResult, isImporting, onImport }: Props) {
  const t = useTranslations('ws-topic-announcements');
  const [sourceName, setSourceName] = useState('');
  const [csv, setCsv] = useState('');
  const [fileName, setFileName] = useState('');
  const [fileRows, setFileRows] = useState<TopicAnnouncementImportRow[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const csvRows = useMemo(() => parseTopicAnnouncementCsv(csv), [csv]);
  const rows = fileName ? fileRows : csvRows;
  const previewRows = useMemo(
    () => validateTopicAnnouncementImportRows(rows),
    [rows]
  );
  const validRows = previewRows
    .filter((row) => row.errors.length === 0)
    .map((row) => row.row);
  const invalidCount = previewRows.length - validRows.length;

  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setFileError(null);
      const parsedRows = await parseWorkbook(file);
      setFileName(file.name);
      setFileRows(parsedRows);
      setCsv('');
    } catch {
      setFileName('');
      setFileRows([]);
      setFileError(t('import_file_failed'));
    }
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)]">
      <div className="space-y-4">
        <div className="rounded-md border bg-background p-4">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="topic-import-source">{t('source_name')}</Label>
              <Input
                id="topic-import-source"
                onChange={(event) => setSourceName(event.target.value)}
                placeholder={t('source_name_placeholder')}
                value={sourceName}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="topic-import-file">{t('upload_excel')}</Label>
              <Input
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                id="topic-import-file"
                onChange={(event) => void handleFileChange(event)}
                type="file"
              />
              <p className="text-muted-foreground text-xs">
                {t('upload_excel_helper')}
              </p>
              {fileName ? (
                <div className="flex items-center gap-2 rounded-md border border-dynamic-green/20 bg-dynamic-green/10 px-3 py-2 text-dynamic-green text-sm">
                  <CheckCircle2 className="h-4 w-4" />
                  <span className="truncate">{fileName}</span>
                </div>
              ) : null}
              {fileError ? (
                <div className="flex items-center gap-2 rounded-md border border-dynamic-red/20 bg-dynamic-red/10 px-3 py-2 text-dynamic-red text-sm">
                  <AlertCircle className="h-4 w-4" />
                  {fileError}
                </div>
              ) : null}
            </div>

            <Separator />

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="topic-import-csv">{t('paste_csv')}</Label>
                <Button
                  className="gap-2"
                  onClick={downloadTopicAnnouncementTemplate}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  <Download className="h-4 w-4" />
                  {t('download_template')}
                </Button>
              </div>
              <Textarea
                className="min-h-40 font-mono text-sm"
                id="topic-import-csv"
                onChange={(event) => {
                  setCsv(event.target.value);
                  setFileName('');
                  setFileRows([]);
                }}
                placeholder={t('csv_placeholder')}
                value={csv}
              />
              <p className="text-muted-foreground text-xs">
                {t('csv_fallback_helper')}
              </p>
            </div>
          </div>
        </div>

        <ImportSummary
          importResult={importResult}
          invalidCount={invalidCount}
          rowCount={previewRows.length}
          validCount={validRows.length}
        />
      </div>

      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-medium text-base">{t('import_preview')}</h3>
            <p className="text-muted-foreground text-sm">
              {t('rows_detected', {
                count: previewRows.length.toString(),
              })}
            </p>
          </div>
          <Button
            className="gap-2"
            disabled={isImporting || validRows.length === 0}
            onClick={() =>
              onImport({
                rows: validRows,
                sourceName: sourceName || undefined,
                sourceType: 'foreign_teacher_schedule',
              })
            }
          >
            <Upload className="h-4 w-4" />
            {t('import_rows')}
          </Button>
        </div>

        <ImportPreviewTable rows={previewRows} />
      </div>
    </div>
  );
}

function ImportSummary({
  importResult,
  invalidCount,
  rowCount,
  validCount,
}: {
  importResult: ImportResult | null;
  invalidCount: number;
  rowCount: number;
  validCount: number;
}) {
  const t = useTranslations('ws-topic-announcements');

  return (
    <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-1">
      <SummaryCard label={t('import_total_rows')} value={rowCount} />
      <SummaryCard label={t('import_valid_rows')} value={validCount} />
      <SummaryCard label={t('import_invalid_rows')} value={invalidCount} />

      {importResult ? (
        <div className="rounded-md border border-dynamic-green/20 bg-dynamic-green/10 p-3 text-dynamic-green sm:col-span-3 xl:col-span-1">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="space-y-1 text-sm">
              <p className="font-medium">
                {t('import_result_summary', {
                  announcements: importResult.createdAnnouncements.toString(),
                  contacts: importResult.createdContacts.toString(),
                })}
              </p>
              {importResult.rowErrors.length > 0 ? (
                <p>
                  {t('import_result_errors', {
                    count: importResult.rowErrors.length.toString(),
                  })}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border bg-background p-3">
      <p className="text-muted-foreground text-sm">{label}</p>
      <p className="mt-1 font-semibold text-2xl">{value}</p>
    </div>
  );
}

function ImportPreviewTable({
  rows,
}: {
  rows: ReturnType<typeof validateTopicAnnouncementImportRows>;
}) {
  const t = useTranslations('ws-topic-announcements');

  return (
    <div className="overflow-hidden rounded-md border bg-background">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('import_row')}</TableHead>
            <TableHead>{t('contact_name')}</TableHead>
            <TableHead>{t('email')}</TableHead>
            <TableHead>{t('classLabel')}</TableHead>
            <TableHead>{t('startTime')}</TableHead>
            <TableHead>{t('topic')}</TableHead>
            <TableHead>{t('status')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.slice(0, 25).map((preview) => (
            <TableRow key={preview.rowNumber}>
              <TableCell>{preview.rowNumber}</TableCell>
              <TableCell className="max-w-44 truncate">
                {preview.row.contactName || t('none')}
              </TableCell>
              <TableCell className="max-w-52 truncate">
                {preview.row.contactEmail || t('none')}
              </TableCell>
              <TableCell className="max-w-32 truncate">
                {preview.row.classLabel || t('none')}
              </TableCell>
              <TableCell>
                {preview.row.startTime}
                {preview.row.endTime ? ` - ${preview.row.endTime}` : ''}
              </TableCell>
              <TableCell className="max-w-64 truncate">
                {preview.row.topic || t('none')}
              </TableCell>
              <TableCell>
                {preview.errors.length === 0 ? (
                  <Badge variant="success">{t('import_ready')}</Badge>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {preview.errors.map((error) => (
                      <Badge key={error} variant="warning">
                        {t(
                          IMPORT_ERROR_LABEL_KEYS[
                            error as keyof typeof IMPORT_ERROR_LABEL_KEYS
                          ]
                        )}
                      </Badge>
                    ))}
                  </div>
                )}
              </TableCell>
            </TableRow>
          ))}
          {rows.length === 0 ? (
            <TableRow>
              <TableCell
                className="text-center text-muted-foreground"
                colSpan={7}
              >
                {t('import_empty_preview')}
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
      {rows.length > 25 ? (
        <div className="border-t px-3 py-2 text-muted-foreground text-sm">
          {t('import_preview_limited', { count: '25' })}
        </div>
      ) : null}
    </div>
  );
}
