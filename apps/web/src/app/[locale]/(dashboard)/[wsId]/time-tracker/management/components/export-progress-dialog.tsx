'use client';

import { Loader2 } from '@tuturuuu/icons';
import { Dialog, DialogContent } from '@tuturuuu/ui/dialog';
import { Progress } from '@tuturuuu/ui/progress';
import { useTranslations } from 'next-intl';

interface ExportProgressDialogProps {
  isExporting: boolean;
  exportProgress: number;
  exportStatus: string;
  estimatedTimeRemaining: number;
  exportType: 'csv' | 'excel' | '';
}

// Helper function to format time remaining
const formatTimeRemaining = (seconds: number): string => {
  if (seconds < 60) {
    return `${Math.round(seconds)}s`;
  } else if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.round(seconds % 60);
    return `${minutes}m ${remainingSeconds}s`;
  } else {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  }
};

export default function ExportProgressDialog({
  isExporting,
  exportProgress,
  exportStatus,
  estimatedTimeRemaining,
  exportType,
}: ExportProgressDialogProps) {
  const t = useTranslations('time-tracker.management.export');

  return (
    <Dialog open={isExporting} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-md" showCloseButton={false}>
        <div className="space-y-6 p-2">
          {/* Header */}
          <div className="flex items-center gap-4">
            <div className="flex size-12 items-center justify-center rounded-full bg-linear-to-br from-dynamic-green/20 to-dynamic-blue/20 ring-2 ring-dynamic-green/10">
              <Loader2 className="size-6 animate-spin text-dynamic-green" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-dynamic-foreground text-lg">
                {t('exportingFile', {
                  type: exportType === 'csv' ? 'CSV' : 'Excel',
                })}
              </h3>
              <p className="text-dynamic-muted text-sm">
                {t('dontCloseWindow')}
              </p>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="space-y-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-dynamic-foreground">{t('progress')}</span>
              <span className="font-medium font-mono text-dynamic-green">
                {Math.round(exportProgress)}%
              </span>
            </div>

            <Progress
              value={exportProgress}
              className="h-3 bg-dynamic-muted/20"
            />

            <div className="flex items-center justify-between text-xs">
              <span className="text-dynamic-muted">{exportStatus}</span>
              {estimatedTimeRemaining > 0 && (
                <span className="text-dynamic-muted">
                  {t('timeRemaining', {
                    time: formatTimeRemaining(estimatedTimeRemaining),
                  })}
                </span>
              )}
            </div>
          </div>

          {/* Tips */}
          <div className="rounded-lg border border-dynamic-blue/20 bg-dynamic-blue/5 p-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex size-5 items-center justify-center rounded-full bg-dynamic-blue/20">
                <span className="text-dynamic-blue text-xs">💡</span>
              </div>
              <div className="flex-1 text-xs">
                <p className="font-medium text-dynamic-blue">
                  {t('tipsTitle')}
                </p>
                <p className="mt-1 text-dynamic-blue/80">
                  {t('tipsDescription')}
                </p>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
