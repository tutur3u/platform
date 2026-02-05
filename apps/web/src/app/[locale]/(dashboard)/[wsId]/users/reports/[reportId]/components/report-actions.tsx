'use client';

import {
  Check,
  Download,
  ImageIcon,
  Monitor,
  Moon,
  Palette,
  Printer,
  Sun,
} from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { useTranslations } from 'next-intl';

type ReportTheme = 'auto' | 'light' | 'dark';

interface ReportActionsProps {
  isPendingApproval: boolean;
  isExporting: boolean;
  handlePrintExport: () => void;
  handlePngExport: () => void;
  reportTheme: ReportTheme;
  setReportTheme: (theme: ReportTheme) => void;
}

export function ReportActions({
  isPendingApproval,
  isExporting,
  handlePrintExport,
  handlePngExport,
  reportTheme,
  setReportTheme,
}: ReportActionsProps) {
  const t = useTranslations();

  return (
    <div className="-mb-2 flex items-center justify-end gap-2">
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
