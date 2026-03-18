'use client';

import {
  Check,
  CheckCircle,
  ChevronDown,
  Download,
  ImageIcon,
  Loader2,
  Monitor,
  Moon,
  Palette,
  Printer,
  Settings2,
  Sun,
  XCircle,
} from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { Switch } from '@tuturuuu/ui/switch';
import { useTranslations } from 'next-intl';
import type { ApprovalStatus } from '../../../approvals/utils';
import type { ExportType } from '../../../reports/[reportId]/hooks/use-report-export';

type ReportTheme = 'auto' | 'light' | 'dark';

interface ReportActionsProps {
  isExportBlockedByStatus: boolean;
  isExporting: boolean;
  isPaginationReady: boolean;
  paginationPageCount: number;
  handlePdfExport: () => void;
  handlePrintExport: () => void;
  handlePngExport: () => void;
  reportTheme: ReportTheme;
  setReportTheme: (theme: ReportTheme) => void;
  canApproveReports?: boolean;
  isNew?: boolean;
  approvalStatus?: ApprovalStatus | null;
  onApprove?: () => void;
  onReject?: () => void;
  isApproving?: boolean;
  isRejecting?: boolean;
  defaultExportType: ExportType;
  setDefaultExportType: (type: ExportType) => void;
  printAfterExport: boolean;
  setPrintAfterExport: (enabled: boolean) => void;
}

export function ReportActions({
  isExportBlockedByStatus,
  isExporting,
  isPaginationReady,
  paginationPageCount,
  handlePdfExport,
  handlePrintExport,
  handlePngExport,
  reportTheme,
  setReportTheme,
  canApproveReports = false,
  isNew = false,
  approvalStatus,
  onApprove,
  onReject,
  isApproving = false,
  isRejecting = false,
  defaultExportType,
  setDefaultExportType,
  printAfterExport,
  setPrintAfterExport,
}: ReportActionsProps) {
  const t = useTranslations();

  const showApprovalActions = canApproveReports && !isNew && approvalStatus;

  const handleDefaultExport = () => {
    if (defaultExportType === 'pdf') {
      handlePdfExport();
    } else {
      handlePngExport();
    }
  };

  return (
    <div className="rounded-[28px] border border-border/60 bg-linear-to-br from-card via-card to-muted/30 p-4 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {approvalStatus === 'APPROVED' && (
            <Badge
              variant="outline"
              className="border-dynamic-green/30 bg-dynamic-green/10 text-dynamic-green"
            >
              <CheckCircle className="mr-1 h-3 w-3" />
              {t('ws-reports.approved')}
            </Badge>
          )}
          {approvalStatus === 'REJECTED' && (
            <Badge
              variant="outline"
              className="border-dynamic-red/30 bg-dynamic-red/10 text-dynamic-red"
            >
              <XCircle className="mr-1 h-3 w-3" />
              {t('ws-reports.rejected')}
            </Badge>
          )}
          {approvalStatus === 'PENDING' && (
            <Badge
              variant="outline"
              className="border-dynamic-yellow/30 bg-dynamic-yellow/10 text-dynamic-yellow"
            >
              {t('ws-reports.pending')}
            </Badge>
          )}
          {showApprovalActions && approvalStatus !== 'APPROVED' && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1 border-dynamic-green/30 text-dynamic-green hover:bg-dynamic-green/10"
              onClick={onApprove}
              disabled={isApproving || isRejecting}
            >
              {isApproving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCircle className="h-3.5 w-3.5" />
              )}
              {t('ws-reports.approve')}
            </Button>
          )}
          {showApprovalActions && approvalStatus !== 'REJECTED' && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1 border-dynamic-red/30 text-dynamic-red hover:bg-dynamic-red/10"
              onClick={onReject}
              disabled={isApproving || isRejecting}
            >
              {isRejecting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <XCircle className="h-3.5 w-3.5" />
              )}
              {t('ws-reports.reject')}
            </Button>
          )}
        </div>

        <div className="space-y-1 lg:text-right">
          <div className="font-medium text-sm">
            {t('ws-reports.report_export_panel_title')}
          </div>
          <p className="text-muted-foreground text-xs">
            {isPaginationReady
              ? t('ws-reports.report_export_panel_ready', {
                  count: paginationPageCount,
                })
              : t('ws-reports.pagination_updating')}
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto]">
        <div className="rounded-2xl border border-border/60 bg-background/80 p-3 shadow-sm backdrop-blur-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-1">
              <div className="font-medium text-sm">
                {t('ws-reports.download_directly_title')}
              </div>
              <p className="text-muted-foreground text-xs">
                {t('ws-reports.download_directly_description')}
              </p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="flex items-center rounded-xl border bg-background shadow-sm">
                <Button
                  size="sm"
                  variant="ghost"
                  className="gap-2 rounded-none rounded-l-xl border-r px-3 hover:bg-accent hover:text-accent-foreground"
                  disabled={
                    isExportBlockedByStatus || isExporting || !isPaginationReady
                  }
                  onClick={handleDefaultExport}
                  title={
                    isExportBlockedByStatus
                      ? t('ws-reports.export_blocked_not_approved')
                      : !isPaginationReady
                        ? t('ws-reports.export_waiting_for_layout')
                        : undefined
                  }
                >
                  {isExporting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : defaultExportType === 'pdf' ? (
                    <Download className="h-4 w-4" />
                  ) : (
                    <ImageIcon className="h-4 w-4" />
                  )}
                  {defaultExportType === 'pdf'
                    ? t('ws-reports.download_pdf')
                    : t('ws-reports.download_png')}
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-9 rounded-none rounded-r-xl px-2 hover:bg-accent hover:text-accent-foreground"
                      disabled={isExportBlockedByStatus || !isPaginationReady}
                    >
                      <ChevronDown className="h-4 w-4 opacity-50" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() => setDefaultExportType('pdf')}
                      className="gap-2"
                    >
                      <Download className="h-4 w-4" />
                      {t('ws-reports.set_default_pdf')}
                      {defaultExportType === 'pdf' && (
                        <Check className="ml-auto h-3.5 w-3.5" />
                      )}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => setDefaultExportType('image')}
                      className="gap-2"
                    >
                      <ImageIcon className="h-4 w-4" />
                      {t('ws-reports.set_default_png')}
                      {defaultExportType === 'image' && (
                        <Check className="ml-auto h-3.5 w-3.5" />
                      )}
                    </DropdownMenuItem>
                    <div className="my-1 h-px bg-muted" />
                    <DropdownMenuItem
                      disabled={
                        isExportBlockedByStatus ||
                        isExporting ||
                        !isPaginationReady
                      }
                      onClick={handlePdfExport}
                      className="gap-2"
                    >
                      <Download className="h-4 w-4" />
                      {t('ws-reports.download_pdf')}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={
                        isExportBlockedByStatus ||
                        isExporting ||
                        !isPaginationReady
                      }
                      onClick={handlePngExport}
                      className="gap-2"
                    >
                      <Download className="h-4 w-4" />
                      {t('ws-reports.download_png')}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={isExportBlockedByStatus || !isPaginationReady}
                      onClick={handlePrintExport}
                      className="gap-2"
                    >
                      <Printer className="h-4 w-4" />
                      {t('ws-reports.print_report')}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-2 rounded-xl"
                  >
                    <Palette className="h-4 w-4" />
                    {t('common.theme')}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setReportTheme('auto')}>
                    <Monitor className="h-4 w-4" />
                    {t('common.auto')}
                    {reportTheme === 'auto' && (
                      <Check className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setReportTheme('light')}>
                    <Sun className="h-4 w-4" />
                    {t('common.light')}
                    {reportTheme === 'light' && (
                      <Check className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setReportTheme('dark')}>
                    <Moon className="h-4 w-4" />
                    {t('common.dark')}
                    {reportTheme === 'dark' && (
                      <Check className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
                    )}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>

        <Popover>
          <PopoverTrigger asChild>
            <Button size="sm" variant="outline" className="gap-2 rounded-xl">
              <Settings2 className="h-4 w-4" />
              {t('common.settings')}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 p-4">
            <div className="flex items-start gap-3">
              <div className="rounded-2xl bg-dynamic-blue/10 p-2 text-dynamic-blue">
                <Printer className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="font-medium text-sm">
                      {t('ws-reports.print_after_pdf_export')}
                    </div>
                    <p className="text-muted-foreground text-xs">
                      {t('ws-reports.print_after_pdf_export_description')}
                    </p>
                  </div>
                  <Switch
                    checked={printAfterExport}
                    onCheckedChange={setPrintAfterExport}
                    aria-label={t('ws-reports.print_after_pdf_export')}
                  />
                </div>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
