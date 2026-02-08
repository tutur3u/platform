'use client';

import { Loader2 } from '@tuturuuu/icons';
import type { WorkspaceUserReport } from '@tuturuuu/types';
import type { WorkspaceConfig } from '@tuturuuu/types/primitives/WorkspaceConfig';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@tuturuuu/ui/alert-dialog';
import ReportPreview from '@tuturuuu/ui/custom/report-preview';
import { Progress } from '@tuturuuu/ui/progress';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { type ReactNode, useCallback, useEffect, useState } from 'react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reports: WorkspaceUserReport[];
  configs: WorkspaceConfig[];
  lang: string;
  theme: 'light' | 'dark';
}

function sanitizeFilename(text: string): string {
  return text
    .replace(/[^a-zA-Z0-9\s\u00C0-\u024F\u1E00-\u1EFF]/g, '_')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_');
}

export function BulkReportExporter({
  open,
  onOpenChange,
  reports,
  configs,
  lang,
  theme,
}: Props) {
  const t = useTranslations();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [completedCount, setCompletedCount] = useState(0);

  const currentReport = reports[currentIndex];

  const getConfig = useCallback(
    (id: string) => {
      const config = configs.find((c) => c.id === id);
      return config?.value;
    },
    [configs]
  );

  const parseDynamicText = useCallback(
    (text?: string | null): ReactNode => {
      if (!text || !currentReport) return '';
      const segments = text.split(/({{.*?}})/g).filter(Boolean);
      return segments.map((segment, index) => {
        const match = segment.match(/{{(.*?)}}/);
        if (match) {
          const key = match?.[1]?.trim() || '';
          if (key === 'user_name') {
            return (
              <span key={key + index} className="font-semibold">
                {(currentReport as any).user_name || '...'}
              </span>
            );
          }
          if (key === 'group_name') {
            return (
              <span key={key + index} className="font-semibold">
                {(currentReport as any).group_name || '...'}
              </span>
            );
          }
          if (key === 'group_manager_name') {
            return (
              <span key={key + index} className="font-semibold">
                {(currentReport as any).creator_name || '...'}
              </span>
            );
          }
          return (
            <span
              key={key + index}
              className="rounded bg-foreground px-1 py-0.5 font-semibold text-background"
            >
              {key}
            </span>
          );
        }
        return segment;
      });
    },
    [currentReport]
  );

  const processExport = useCallback(async () => {
    if (!open || !isProcessing || !currentReport) return;

    try {
      // Small delay to ensure rendering
      await new Promise((resolve) => setTimeout(resolve, 500));

      const html2canvas = (await import('html2canvas-pro')).default;
      const printableArea = document.getElementById(
        'bulk-export-printable-area'
      );

      if (!printableArea) {
        throw new Error('Preview area not found');
      }

      const canvas = await html2canvas(printableArea, {
        scale: 2,
        useCORS: true,
        backgroundColor: theme === 'dark' ? '#1a1a1a' : '#ffffff',
        width: printableArea.offsetWidth,
        height: printableArea.offsetHeight,
      });

      await new Promise<void>((resolve, reject) => {
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Failed to create image'));
              return;
            }

            try {
              const url = URL.createObjectURL(blob);
              const link = document.createElement('a');
              link.href = url;

              const userName = (currentReport as any).user_name;
              const groupName = (currentReport as any).group_name;
              const title = currentReport.title;

              const parts = [
                userName && sanitizeFilename(userName),
                groupName && sanitizeFilename(groupName),
                title ? sanitizeFilename(title) : 'report',
              ].filter(Boolean);

              const fileName = `${parts.join('_')}.png`;

              link.download = fileName;
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
              URL.revokeObjectURL(url);
              resolve();
            } catch (error) {
              reject(error);
            }
          },
          'image/png',
          1.0
        );
      });

      setCompletedCount((prev) => prev + 1);

      if (currentIndex < reports.length - 1) {
        setCurrentIndex((prev) => prev + 1);
      } else {
        setIsProcessing(false);
        toast.success(t('ws-reports.export_png_success'));
        onOpenChange(false);
      }
    } catch (error) {
      console.error('Export failed:', error);
      toast.error(t('ws-reports.failed_export_png'));
      setIsProcessing(false);
    }
  }, [
    open,
    isProcessing,
    currentReport,
    theme,
    currentIndex,
    reports.length,
    t,
    onOpenChange,
  ]);

  useEffect(() => {
    if (open && !isProcessing && completedCount === 0) {
      setIsProcessing(true);
    }
  }, [open, isProcessing, completedCount]);

  useEffect(() => {
    if (isProcessing) {
      processExport();
    }
  }, [isProcessing, processExport]);

  // Reset state when closed
  useEffect(() => {
    if (!open) {
      setCurrentIndex(0);
      setCompletedCount(0);
      setIsProcessing(false);
    }
  }, [open]);

  if (!open) return null;

  const progress = Math.round((completedCount / reports.length) * 100);

  return (
    <>
      <AlertDialog open={open} onOpenChange={onOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isProcessing
                ? t('ws-reports.exporting_png')
                : t('ws-reports.export_png_success')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {completedCount} / {reports.length}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="py-4">
            <Progress value={progress} className="h-2" />
          </div>

          <AlertDialogFooter>
            <AlertDialogAction
              disabled={isProcessing}
              onClick={() => onOpenChange(false)}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('common.processing')}
                </>
              ) : (
                t('common.close')
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Hidden container for rendering reports */}
      <div className="fixed top-0 left-0 -z-50 h-0 w-0 overflow-hidden opacity-0">
        {currentReport && (
          <div id="bulk-export-container">
            <div
              id="bulk-export-printable-area"
              className={`h-[297mm] w-[210mm] ${
                theme === 'dark' ? 'bg-foreground/10' : 'bg-white'
              }`}
            >
              <ReportPreview
                t={t}
                lang={lang}
                parseDynamicText={parseDynamicText}
                getConfig={getConfig}
                theme={theme}
                data={{
                  title: currentReport.title || '',
                  content: currentReport.content || '',
                  score: currentReport.score?.toString() || '',
                  feedback: currentReport.feedback || '',
                }}
              />
            </div>
          </div>
        )}
      </div>
    </>
  );
}
