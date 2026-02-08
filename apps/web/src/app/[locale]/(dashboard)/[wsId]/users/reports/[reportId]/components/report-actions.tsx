'use client';

import {
  Check,
  CheckCircle,
  Download,
  ImageIcon,
  Loader2,
  Monitor,
  Moon,
  Palette,
  Printer,
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
import { useTranslations } from 'next-intl';
import type { ApprovalStatus } from '../../../approvals/utils';

type ReportTheme = 'auto' | 'light' | 'dark';

interface ReportActionsProps {
  isPendingApproval: boolean;
  isExporting: boolean;
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
}

export function ReportActions({
  isPendingApproval,
  isExporting,
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
}: ReportActionsProps) {
  const t = useTranslations();

  const showApprovalActions = canApproveReports && !isNew && approvalStatus;

  return (
    <div className="-mb-2 flex items-center justify-between gap-2">
      {showApprovalActions ? (
        <div className="flex items-center gap-2">
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
          {approvalStatus !== 'APPROVED' && (
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
          {approvalStatus !== 'REJECTED' && (
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
      ) : (
        <div />
      )}
      <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="sm"
              variant="outline"
              className="gap-2"
              disabled={isPendingApproval}
              title={
                isPendingApproval
                  ? t('ws-reports.export_blocked_not_approved')
                  : undefined
              }
            >
              <Download className="h-4 w-4" />
              {t('common.export')}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem
              onClick={(e) => {
                e.preventDefault();
                handlePrintExport();
              }}
              className="gap-2"
            >
              <Printer className="h-4 w-4" />
              {t('ws-reports.print')}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={isExporting}
              onClick={(e) => {
                e.preventDefault();
                handlePngExport();
              }}
              className="gap-2"
            >
              <ImageIcon className="h-4 w-4" />
              {isExporting
                ? t('ws-reports.exporting_png')
                : t('ws-reports.png')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline" className="gap-2">
              <Palette className="h-4 w-4" />
              {t('common.theme')}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
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
  );
}
