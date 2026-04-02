'use client';

import { useMutation } from '@tanstack/react-query';
import { listWorkspaceUserAuditLogs } from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import {
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { Progress } from '@tuturuuu/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { XLSX } from '@tuturuuu/ui/xlsx';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { jsonToCSV } from 'react-papaparse';
import { getAuditLogTimeRange } from './audit-log-time';
import type {
  AuditLogEventKindFilter,
  AuditLogPeriod,
  AuditLogSourceFilter,
} from './audit-log-types';

interface Props {
  wsId: string;
  locale: string;
  period: AuditLogPeriod;
  month?: string;
  year?: string;
  eventKind: AuditLogEventKindFilter;
  source: AuditLogSourceFilter;
  affectedUserQuery: string;
  actorQuery: string;
}

type ExportFileType = 'excel' | 'csv';

function getFileExtension(fileType: ExportFileType) {
  return fileType === 'csv' ? 'csv' : 'xlsx';
}

function downloadBlob(blob: Blob, filename: string) {
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);

  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function formatDateTime(value: string | null, locale: string) {
  if (!value) return '';

  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export function AuditLogExportDialogContent({
  wsId,
  locale,
  period,
  month,
  year,
  eventKind,
  source,
  affectedUserQuery,
  actorQuery,
}: Props) {
  const commonT = useTranslations();
  const t = useTranslations('audit-log-insights');
  const tableT = useTranslations('audit-log-table');
  const [filename, setFilename] = useState('');
  const [exportFileType, setExportFileType] = useState<ExportFileType>('excel');
  const [progress, setProgress] = useState(0);

  const timeRange = useMemo(() => {
    return getAuditLogTimeRange({
      period,
      month,
      year,
    });
  }, [month, period, year]);

  const periodLabel = useMemo(() => {
    return new Intl.DateTimeFormat(locale, {
      ...(period === 'yearly'
        ? { year: 'numeric' }
        : { month: 'long', year: 'numeric' }),
    }).format(timeRange.start);
  }, [locale, period, timeRange.start]);

  const defaultFilename = `workspace_user_audit_${timeRange.value}.${getFileExtension(
    exportFileType
  )}`;

  const exportMutation = useMutation({
    mutationFn: async () => {
      const allRows = [];
      const pageSize = 500;
      let offset = 0;

      while (true) {
        const response = await listWorkspaceUserAuditLogs(wsId, {
          start: timeRange.start.toISOString(),
          end: timeRange.end.toISOString(),
          eventKind,
          source,
          affectedUserQuery,
          actorQuery,
          offset,
          limit: pageSize,
        });

        allRows.push(...response.data);

        if (response.data.length < pageSize) {
          break;
        }

        offset += pageSize;
        setProgress(Math.min(95, 15 + offset / 20));
      }

      return allRows;
    },
    onSuccess: (allRows) => {
      const exportRows = allRows.map((entry) => ({
        [tableT('action')]: tableT(`event_kind.${entry.eventKind}`),
        [tableT('summary')]: entry.summary,
        [tableT('affected_user')]:
          entry.affectedUser.name ||
          entry.affectedUser.email ||
          tableT('unknown_user'),
        [tableT('actor')]:
          entry.actor.name || entry.actor.email || tableT('system'),
        [tableT('changed_fields')]: entry.changedFields.join(', '),
        [tableT('source')]: tableT(`source_label.${entry.source}`),
        [tableT('occurred_at')]: formatDateTime(entry.occurredAt, locale),
      }));

      const nextFilename =
        exportFileType === 'csv'
          ? `${(filename || defaultFilename).replace(/\.csv/gi, '')}.csv`
          : `${(filename || defaultFilename).replace(/\.xlsx/gi, '')}.xlsx`;

      if (exportFileType === 'csv') {
        const csv = jsonToCSV(exportRows);
        downloadBlob(
          new Blob([csv], { type: 'text/csv;charset=utf-8;' }),
          nextFilename
        );
      } else {
        const worksheet = XLSX.utils.json_to_sheet(exportRows);
        const workbook = XLSX.utils.book_new();

        XLSX.utils.book_append_sheet(workbook, worksheet, 'User Audit');

        const excelBuffer = XLSX.write(workbook, {
          bookType: 'xlsx',
          type: 'array',
        });

        downloadBlob(
          new Blob([excelBuffer], {
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          }),
          nextFilename
        );
      }

      setProgress(100);
    },
    onError: (error) => {
      console.error('Failed to export audit log:', error);
    },
  });

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t('export_button')}</DialogTitle>
        <DialogDescription>
          {t('export_description', {
            period: periodLabel,
          })}
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-4">
        <div className="grid w-full items-center gap-2">
          <Label htmlFor="audit-log-file-name">{t('file_name_label')}</Label>
          <Input
            id="audit-log-file-name"
            value={filename}
            onChange={(event) => setFilename(event.target.value)}
            placeholder={defaultFilename}
            disabled={exportMutation.isPending}
          />
        </div>

        <div className="grid w-full items-center gap-2">
          <Label htmlFor="audit-log-file-type">{t('file_type_label')}</Label>
          <Select
            value={exportFileType}
            onValueChange={(value) =>
              setExportFileType(value as ExportFileType)
            }
            disabled={exportMutation.isPending}
          >
            <SelectTrigger id="audit-log-file-type" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="excel">{t('excel_label')}</SelectItem>
              <SelectItem value="csv">{t('csv_label')}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {exportMutation.isPending ? (
          <Progress value={progress} className="h-2 w-full" />
        ) : null}
      </div>

      <DialogFooter className="justify-between">
        <DialogClose asChild>
          <Button type="button" variant="secondary">
            {commonT('common.cancel')}
          </Button>
        </DialogClose>
        <Button
          onClick={() => {
            setProgress(0);
            exportMutation.mutate();
          }}
          disabled={exportMutation.isPending}
        >
          {exportMutation.isPending
            ? commonT('common.processing')
            : commonT('common.export')}
        </Button>
      </DialogFooter>
    </>
  );
}
