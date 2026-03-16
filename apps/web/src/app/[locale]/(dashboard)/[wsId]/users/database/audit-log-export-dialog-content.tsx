'use client';

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
  AuditLogEntry,
  AuditLogPeriod,
  AuditLogStatusFilter,
} from './audit-log-types';

interface Props {
  wsId: string;
  locale: string;
  period: AuditLogPeriod;
  month?: string;
  year?: string;
  status: AuditLogStatusFilter;
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
  status,
}: Props) {
  const commonT = useTranslations();
  const t = useTranslations('audit-log-insights');
  const tableT = useTranslations('audit-log-table');
  const [filename, setFilename] = useState('');
  const [exportFileType, setExportFileType] = useState<ExportFileType>('excel');
  const [progress, setProgress] = useState(0);
  const [isExporting, setIsExporting] = useState(false);

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

  const statusLabel =
    status === 'archived'
      ? t('status_archived')
      : status === 'active'
        ? t('status_active')
        : t('status_all');
  const defaultFilename = `audit_log_${timeRange.value}.${getFileExtension(
    exportFileType
  )}`;

  const downloadCSV = (
    data: Record<string, string>[],
    nextFilename: string
  ) => {
    const csv = jsonToCSV(data);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    downloadBlob(blob, nextFilename);
  };

  const downloadExcel = (
    data: Record<string, string>[],
    nextFilename: string
  ) => {
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(workbook, worksheet, 'Audit Log');

    const excelBuffer = XLSX.write(workbook, {
      bookType: 'xlsx',
      type: 'array',
    });

    const blob = new Blob([excelBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    downloadBlob(blob, nextFilename);
  };

  const handleExport = async () => {
    setIsExporting(true);
    setProgress(0);

    const allRows: AuditLogEntry[] = [];
    const pageSize = 500;
    let page = 1;

    try {
      while (true) {
        const offset = (page - 1) * pageSize;
        const searchParams = new URLSearchParams({
          start: timeRange.start.toISOString(),
          end: timeRange.end.toISOString(),
          offset: String(offset),
          limit: String(pageSize),
        });

        if (status !== 'all') {
          searchParams.set('status', status);
        }

        const res = await fetch(
          `/api/v1/workspaces/${wsId}/users/audit-logs?${searchParams.toString()}`,
          { cache: 'no-store' }
        );

        if (!res.ok) throw new Error('Failed to fetch audit logs');
        const rows = (await res.json()) as AuditLogEntry[];

        allRows.push(...rows);

        if (rows.length < pageSize) {
          break;
        }

        page += 1;
        setProgress(Math.min(95, page * 12));
      }

      const exportRows = allRows.map((entry) => ({
        [tableT('id')]: entry.id,
        [t('columns.user')]: entry.user_full_name || tableT('unknown_user'),
        [t('columns.status')]: entry.archived
          ? tableT('archived')
          : tableT('active'),
        [t('columns.archived_until')]: formatDateTime(
          entry.archived_until,
          locale
        ),
        [t('columns.updated_by')]: entry.creator_full_name || tableT('system'),
        [t('columns.changed_at')]: formatDateTime(entry.created_at, locale),
      }));

      const nextFilename =
        exportFileType === 'csv'
          ? `${(filename || defaultFilename).replace(/\.csv/gi, '')}.csv`
          : `${(filename || defaultFilename).replace(/\.xlsx/gi, '')}.xlsx`;

      setProgress(100);

      if (exportFileType === 'csv') {
        downloadCSV(exportRows, nextFilename);
      } else {
        downloadExcel(exportRows, nextFilename);
      }
    } catch (error) {
      console.error('Failed to export audit log:', error);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t('export_button')}</DialogTitle>
        <DialogDescription>
          {t('export_description', {
            period: periodLabel,
            filter: statusLabel.toLowerCase(),
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
            disabled={isExporting}
          />
        </div>

        <div className="grid w-full items-center gap-2">
          <Label htmlFor="audit-log-file-type">{t('file_type_label')}</Label>
          <Select
            value={exportFileType}
            onValueChange={(value) =>
              setExportFileType(value as ExportFileType)
            }
            disabled={isExporting}
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

        {isExporting && <Progress value={progress} className="h-2 w-full" />}
      </div>

      <DialogFooter className="justify-between">
        <DialogClose asChild>
          <Button type="button" variant="secondary">
            {commonT('common.cancel')}
          </Button>
        </DialogClose>
        <Button onClick={handleExport} disabled={isExporting}>
          {isExporting
            ? commonT('common.processing')
            : commonT('common.export')}
        </Button>
      </DialogFooter>
    </>
  );
}
