'use client';

import {
  AlertCircle,
  CalendarRange,
  Download,
  FileSpreadsheet,
  FileText,
  Loader2,
} from '@tuturuuu/icons';
import {
  listWorkspaceAttendanceExportRecords,
  type WorkspaceAttendanceExportRecord,
} from '@tuturuuu/internal-api/users';
import { Alert, AlertDescription, AlertTitle } from '@tuturuuu/ui/alert';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
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
import { toast } from '@tuturuuu/ui/sonner';
import { XLSX } from '@tuturuuu/ui/xlsx';
import { cn } from '@tuturuuu/utils/format';
import {
  differenceInCalendarDays,
  format,
  parseISO,
  startOfMonth,
  subDays,
} from 'date-fns';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { jsonToCSV } from 'react-papaparse';
import {
  type AttendanceExportFileType,
  buildAttendanceExportFilename,
  toAttendanceExportRows,
} from './attendance-export-utils';

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

function exportRowsToFile(
  rows: Record<string, string>[],
  filename: string,
  fileType: AttendanceExportFileType
) {
  if (fileType === 'csv') {
    const csv = jsonToCSV(rows);
    downloadBlob(
      new Blob([csv], { type: 'text/csv;charset=utf-8;' }),
      filename
    );
    return;
  }

  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Attendance');
  const workbookBuffer = XLSX.write(workbook, {
    type: 'array',
    bookType: 'xlsx',
  });
  downloadBlob(
    new Blob([workbookBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    filename
  );
}

function buildQuickRanges(today: Date) {
  return {
    last7Days: {
      endDate: format(today, 'yyyy-MM-dd'),
      startDate: format(subDays(today, 6), 'yyyy-MM-dd'),
    },
    thisMonth: {
      endDate: format(today, 'yyyy-MM-dd'),
      startDate: format(startOfMonth(today), 'yyyy-MM-dd'),
    },
    today: {
      endDate: format(today, 'yyyy-MM-dd'),
      startDate: format(today, 'yyyy-MM-dd'),
    },
  };
}

export default function AttendanceExportCard({ wsId }: { wsId: string }) {
  const tAttendance = useTranslations('ws-user-attendance');
  const tCommon = useTranslations('common');
  const tDateRange = useTranslations('date_range');
  const tGroupAttendance = useTranslations('ws-user-group-attendance');

  const quickRanges = useMemo(() => buildQuickRanges(new Date()), []);

  const [startDate, setStartDate] = useState(quickRanges.thisMonth.startDate);
  const [endDate, setEndDate] = useState(quickRanges.thisMonth.endDate);
  const [fileType, setFileType] = useState<AttendanceExportFileType>('excel');
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [processedRows, setProcessedRows] = useState(0);
  const [totalRows, setTotalRows] = useState(0);
  const [exportError, setExportError] = useState<string | null>(null);

  const selectedRangeKey = useMemo(() => {
    if (
      startDate === quickRanges.today.startDate &&
      endDate === quickRanges.today.endDate
    ) {
      return 'today';
    }

    if (
      startDate === quickRanges.last7Days.startDate &&
      endDate === quickRanges.last7Days.endDate
    ) {
      return 'last7Days';
    }

    if (
      startDate === quickRanges.thisMonth.startDate &&
      endDate === quickRanges.thisMonth.endDate
    ) {
      return 'thisMonth';
    }

    return null;
  }, [endDate, quickRanges, startDate]);

  const rangeError = useMemo(() => {
    if (!startDate || !endDate) {
      return tAttendance('export.validation.missing_dates');
    }

    if (startDate > endDate) {
      return tAttendance('export.validation.invalid_range');
    }

    return null;
  }, [endDate, startDate, tAttendance]);

  const selectedDays = useMemo(() => {
    if (rangeError) return 0;

    return differenceInCalendarDays(parseISO(endDate), parseISO(startDate)) + 1;
  }, [endDate, rangeError, startDate]);

  const filename = useMemo(
    () => buildAttendanceExportFilename(startDate, endDate, fileType),
    [endDate, fileType, startDate]
  );

  const exportLabels = useMemo(
    () => ({
      columns: {
        date: tAttendance('export.columns.date'),
        email: tAttendance('export.columns.email'),
        group: tAttendance('export.columns.group'),
        groupId: tAttendance('export.columns.group_id'),
        notes: tAttendance('export.columns.notes'),
        status: tAttendance('export.columns.status'),
        userId: tAttendance('export.columns.user_id'),
        userName: tAttendance('export.columns.user_name'),
      },
      statuses: {
        absent: tAttendance('absent'),
        late: tGroupAttendance('late'),
        present: tAttendance('present'),
        unknown: tAttendance('export.status_unknown'),
      },
    }),
    [tAttendance, tGroupAttendance]
  );

  const setPresetRange = (preset: keyof typeof quickRanges) => {
    setStartDate(quickRanges[preset].startDate);
    setEndDate(quickRanges[preset].endDate);
    setExportError(null);
  };

  const handleExport = async () => {
    if (rangeError) {
      setExportError(rangeError);
      return;
    }

    setExportError(null);
    setIsExporting(true);
    setProgress(0);
    setProcessedRows(0);
    setTotalRows(0);

    try {
      const rows: WorkspaceAttendanceExportRecord[] = [];
      const pageSize = 500;
      let nextOffset = 0;

      while (true) {
        const response = await listWorkspaceAttendanceExportRecords(wsId, {
          endDate,
          limit: pageSize,
          offset: nextOffset,
          startDate,
        });

        rows.push(...response.data);
        setProcessedRows(rows.length);
        setTotalRows(response.count);
        setProgress(
          response.count > 0 ? (rows.length / response.count) * 100 : 100
        );

        if (response.nextOffset === undefined) {
          break;
        }

        nextOffset = response.nextOffset;
      }

      if (rows.length === 0) {
        toast.info(tAttendance('export.no_records'));
        return;
      }

      exportRowsToFile(
        toAttendanceExportRows(rows, exportLabels),
        filename,
        fileType
      );
      toast.success(tCommon('export-success'));
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : tCommon('export-error');
      setExportError(message);
      toast.error(message);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Card className="overflow-hidden border-primary/15 bg-linear-to-br from-primary/6 via-background to-background shadow-sm">
      <CardHeader className="gap-3 pb-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="rounded-lg border border-primary/20 bg-primary/10 p-2 text-primary">
                <Download className="h-4 w-4" />
              </div>
              <CardTitle>{tAttendance('export.title')}</CardTitle>
            </div>
            <CardDescription className="max-w-3xl">
              {tAttendance('export.description')}
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="gap-1.5">
              <CalendarRange className="h-3.5 w-3.5" />
              {tAttendance('export.inclusive_badge')}
            </Badge>
            <Badge variant="secondary">
              {tAttendance('export.range_days', { count: selectedDays })}
            </Badge>
            <Badge variant="secondary">
              {tAttendance('export.recorded_rows_badge')}
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)]">
          <div className="space-y-4 rounded-2xl border bg-background/80 p-4">
            <div className="space-y-2">
              <Label>{tAttendance('export.quick_ranges_label')}</Label>
              <div className="flex flex-wrap gap-2">
                {[
                  {
                    key: 'today' as const,
                    label: tCommon('today'),
                  },
                  {
                    key: 'last7Days' as const,
                    label: tDateRange('last_7_days'),
                  },
                  {
                    key: 'thisMonth' as const,
                    label: tDateRange('this_month'),
                  },
                ].map((preset) => (
                  <Button
                    key={preset.key}
                    type="button"
                    size="sm"
                    variant={
                      selectedRangeKey === preset.key ? 'default' : 'outline'
                    }
                    className={cn(
                      'rounded-full',
                      selectedRangeKey === preset.key &&
                        'shadow-[0_10px_24px_-18px_hsl(var(--primary))]'
                    )}
                    onClick={() => setPresetRange(preset.key)}
                  >
                    {preset.label}
                  </Button>
                ))}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="attendance-export-start">
                  {tAttendance('export.start_date')}
                </Label>
                <Input
                  id="attendance-export-start"
                  type="date"
                  value={startDate}
                  max={endDate}
                  onChange={(event) => setStartDate(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="attendance-export-end">
                  {tAttendance('export.end_date')}
                </Label>
                <Input
                  id="attendance-export-end"
                  type="date"
                  value={endDate}
                  min={startDate}
                  max={quickRanges.today.endDate}
                  onChange={(event) => setEndDate(event.target.value)}
                />
              </div>
            </div>

            <p className="text-muted-foreground text-sm">
              {tAttendance('export.date_hint')}
            </p>
          </div>

          <div className="space-y-4 rounded-2xl border bg-background/80 p-4">
            <div className="space-y-2">
              <Label htmlFor="attendance-export-type">
                {tAttendance('export.file_type_label')}
              </Label>
              <Select
                value={fileType}
                onValueChange={(value) =>
                  setFileType(value as AttendanceExportFileType)
                }
              >
                <SelectTrigger id="attendance-export-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="excel">
                    <div className="flex items-center gap-2">
                      <FileSpreadsheet className="h-4 w-4 text-dynamic-green" />
                      <span>{tAttendance('export.file_types.excel')}</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="csv">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-dynamic-blue" />
                      <span>{tAttendance('export.file_types.csv')}</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="rounded-xl border bg-muted/30 p-3">
              <p className="font-medium text-sm">
                {tAttendance('export.file_name_preview_label')}
              </p>
              <p className="mt-1 break-all text-muted-foreground text-sm">
                {filename}
              </p>
            </div>

            <Button
              type="button"
              className="w-full gap-2"
              disabled={isExporting || !!rangeError}
              onClick={() => void handleExport()}
            >
              {isExporting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {tAttendance('export.exporting_button')}
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" />
                  {tAttendance('export.export_button')}
                </>
              )}
            </Button>
          </div>
        </div>

        {isExporting && (
          <div className="space-y-2 rounded-2xl border bg-background/80 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="font-medium text-sm">
                {tAttendance('export.progress_title')}
              </p>
              <p className="text-muted-foreground text-sm">
                {tAttendance('export.progress_rows', {
                  processed: processedRows,
                  total: totalRows,
                })}
              </p>
            </div>
            <Progress value={progress} />
          </div>
        )}

        {exportError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>{tAttendance('export.error_title')}</AlertTitle>
            <AlertDescription>{exportError}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
