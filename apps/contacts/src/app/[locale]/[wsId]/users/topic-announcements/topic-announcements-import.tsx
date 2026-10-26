'use client';

import { Send, Upload } from '@tuturuuu/icons';
import type {
  TopicAnnouncementImportPayload,
  TopicAnnouncementImportResult,
  TopicAnnouncementImportRow,
} from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import type { ChangeEvent } from 'react';
import { useMemo, useState } from 'react';
import {
  createEmptyImportRows,
  type EditableImportRow,
  hasImportRowContent,
  padImportRows,
  previewImportRows,
} from './import-row-preview';
import { parseTopicAnnouncementCsv } from './import-utils';
import {
  downloadTopicAnnouncementTemplate,
  parseImportWorkbook,
} from './import-workbook';
import type {
  MatchableContact,
  MatchableWorkspaceUser,
} from './teacher-schedule-matching';
import { TeacherScheduleOptions } from './teacher-schedule-options';
import {
  clampScheduleDuration,
  DEFAULT_SCHEDULE_DURATION_MINUTES,
} from './teacher-schedule-parser';
import {
  addMinutesToTime,
  normalizeScheduleTime,
} from './teacher-schedule-values';
import { TopicAnnouncementsHelpTip } from './topic-announcements-help-tip';
import { BulkAnnouncementGrid } from './topic-announcements-import-grid';
import { ImportSourcePanel } from './topic-announcements-import-source-panel';
import { ImportSummary } from './topic-announcements-import-summary';

export { downloadTopicAnnouncementTemplate } from './import-workbook';

const BULK_SEND_LIMIT = 50;
const EMPTY_CONTACTS: MatchableContact[] = [];
const EMPTY_USERS: MatchableWorkspaceUser[] = [];

interface Props {
  canSend: boolean;
  contacts?: MatchableContact[];
  importResult: TopicAnnouncementImportResult | null;
  isImporting: boolean;
  isSending: boolean;
  onImport: (payload: TopicAnnouncementImportPayload) => void;
  onImportAndSend: (payload: TopicAnnouncementImportPayload) => void;
  workspaceUsers?: MatchableWorkspaceUser[];
}

function buildImportPayload(
  rows: TopicAnnouncementImportRow[],
  sourceName: string
): TopicAnnouncementImportPayload {
  return {
    rows,
    sourceName: sourceName || undefined,
    sourceType: 'foreign_teacher_schedule',
  };
}

function applyDuration(rows: EditableImportRow[], minutes: number) {
  return rows.map((row) => {
    const start = row.startTime && normalizeScheduleTime(row.startTime);
    const end = start && addMinutesToTime(start, minutes);
    return end ? { ...row, endTime: end } : row;
  });
}

export function ImportPanel({
  canSend,
  contacts = EMPTY_CONTACTS,
  importResult,
  isImporting,
  isSending,
  onImport,
  onImportAndSend,
  workspaceUsers = EMPTY_USERS,
}: Props) {
  const t = useTranslations('ws-topic-announcements');
  const [sourceName, setSourceName] = useState('');
  const [csv, setCsv] = useState('');
  const [fileName, setFileName] = useState('');
  const [fileError, setFileError] = useState<string | null>(null);
  const [scheduleMode, setScheduleMode] = useState(false);
  const [durationMinutes, setDurationMinutes] = useState(
    DEFAULT_SCHEDULE_DURATION_MINUTES
  );
  const [rows, setRows] = useState<EditableImportRow[]>(
    createEmptyImportRows()
  );
  const previewRows = useMemo(
    () =>
      previewImportRows(rows, {
        contacts,
        requireSchedule: scheduleMode,
        workspaceUsers,
      }),
    [contacts, rows, scheduleMode, workspaceUsers]
  );
  const filledRows = previewRows.filter((preview) =>
    hasImportRowContent(preview.row)
  );
  const validRows = filledRows.flatMap((preview) =>
    preview.submitRow ? [preview.submitRow] : []
  );
  const invalidCount = filledRows.length - validRows.length;
  const isBusy = isImporting || isSending;
  const sendTooLarge = validRows.length > BULK_SEND_LIMIT;
  const sendNeedsTopics = validRows.some((row) => !row.topic?.trim());

  const loadRows = (nextRows: EditableImportRow[]) => {
    setRows(padImportRows(nextRows));
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setFileError(null);
      const parsed = await parseImportWorkbook(file, durationMinutes);
      setFileName(file.name);
      setCsv('');
      setScheduleMode(parsed.kind === 'schedule');
      loadRows(parsed.rows);
    } catch {
      setFileName('');
      setFileError(t('import_file_failed'));
    }
  };

  const loadCsvRows = () => {
    const csvRows = parseTopicAnnouncementCsv(csv);
    setFileName('');
    setScheduleMode(false);
    loadRows(csvRows);
  };

  const resetRows = () => {
    setCsv('');
    setFileName('');
    setFileError(null);
    setScheduleMode(false);
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

      {scheduleMode ? (
        <TeacherScheduleOptions
          disabled={isBusy}
          durationMinutes={durationMinutes}
          onApplyDuration={() =>
            setRows(applyDuration(rows, clampScheduleDuration(durationMinutes)))
          }
          onDurationChange={setDurationMinutes}
          rowCount={filledRows.length}
        />
      ) : null}

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
              disabled={isBusy || validRows.length === 0}
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
              disabled={
                !canSend ||
                isBusy ||
                sendTooLarge ||
                sendNeedsTopics ||
                validRows.length === 0
              }
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
          {sendNeedsTopics ? (
            <p className="max-w-80 text-muted-foreground text-xs">
              {t('bulk_send_requires_topic')}
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
