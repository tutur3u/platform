'use client';

import { useLocalStorage } from '@tuturuuu/ui/hooks/use-local-storage';
import { toast } from '@tuturuuu/ui/sonner';
import { escape as escapeString } from 'lodash';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { buildReportPrintContent } from './report-print-template';

export type ExportType = 'pdf' | 'image';

export interface ReportExportMetadata {
  title?: string | null;
  userName?: string | null;
  groupName?: string | null;
}

interface ExportReportPngOptions {
  elementId: string;
  isDarkPreview: boolean;
  metadata: ReportExportMetadata;
}

interface ExportReportPdfOptions extends ExportReportPngOptions {
  onAfterDownload?: () => void;
}

interface UseBulkReportExportOptions<TReport> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reports: TReport[];
  isDarkPreview: boolean;
  getMetadata: (report: TReport) => ReportExportMetadata;
  elementId?: string;
  renderWaitMs?: number;
}

export function normalizePrintAfterExportPreference(value: unknown): boolean {
  return value === true;
}

function sanitizeFilename(text: string): string {
  return text
    .replace(/[^a-zA-Z0-9\s\u00C0-\u024F\u1E00-\u1EFF]/g, '_')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_');
}

function buildPngFilename({
  title,
  userName,
  groupName,
}: ReportExportMetadata): string {
  const parts = [
    userName && sanitizeFilename(userName),
    groupName && sanitizeFilename(groupName),
    title ? sanitizeFilename(title) : 'report',
  ].filter(Boolean);

  return `${parts.join('_')}.png`;
}

function buildPdfFilename({
  title,
  userName,
  groupName,
}: ReportExportMetadata): string {
  const parts = [
    userName && sanitizeFilename(userName),
    groupName && sanitizeFilename(groupName),
    title ? sanitizeFilename(title) : 'report',
  ].filter(Boolean);

  return `${parts.join('_')}.pdf`;
}

function buildPagedPngFilename(
  metadata: ReportExportMetadata,
  pageNumber: number,
  totalPages: number
): string {
  if (totalPages <= 1) {
    return buildPngFilename(metadata);
  }

  const baseName = buildPngFilename(metadata).replace(/\.png$/i, '');
  const paddedPageNumber = String(pageNumber).padStart(2, '0');

  return `${baseName}_page_${paddedPageNumber}.png`;
}

function getRenderablePages(elementId: string): HTMLElement[] {
  const printableArea = document.getElementById(elementId);

  if (!printableArea) {
    throw new Error('Preview area not found');
  }

  const pages = Array.from(
    printableArea.querySelectorAll<HTMLElement>('[data-report-page]')
  );

  return pages.length > 0 ? pages : [printableArea];
}

async function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Failed to create image'));
          return;
        }

        resolve(blob);
      },
      'image/png',
      1.0
    );
  });
}

async function renderReportPageCanvases({
  elementId,
  isDarkPreview,
}: Pick<ExportReportPngOptions, 'elementId' | 'isDarkPreview'>): Promise<
  HTMLCanvasElement[]
> {
  const html2canvas = (await import('html2canvas-pro')).default;
  const pages = getRenderablePages(elementId);
  const canvases: HTMLCanvasElement[] = [];

  for (const page of pages) {
    const canvas = await html2canvas(page, {
      backgroundColor: isDarkPreview ? '#020617' : '#ffffff',
      height: page.offsetHeight,
      scale: 2,
      useCORS: true,
      width: page.offsetWidth,
      windowHeight: page.scrollHeight,
      windowWidth: page.scrollWidth,
    });

    canvases.push(canvas);
  }

  return canvases;
}

async function downloadBlob(blob: Blob, filename: string): Promise<void> {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  try {
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Give browsers a moment between page downloads.
    await new Promise((resolve) => setTimeout(resolve, 120));
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function exportReportAsPng({
  elementId,
  isDarkPreview,
  metadata,
}: ExportReportPngOptions): Promise<number> {
  const canvases = await renderReportPageCanvases({
    elementId,
    isDarkPreview,
  });

  for (const [index, canvas] of canvases.entries()) {
    const blob = await canvasToBlob(canvas);

    await downloadBlob(
      blob,
      buildPagedPngFilename(metadata, index + 1, canvases.length)
    );
  }

  return canvases.length;
}

export async function exportReportAsPdf({
  elementId,
  isDarkPreview,
  metadata,
  onAfterDownload,
}: ExportReportPdfOptions): Promise<number> {
  const [{ jsPDF }, canvases] = await Promise.all([
    // Use the browser ESM bundle explicitly so client SSR does not resolve the
    // Node entry (`jspdf.node.min.js`), which breaks Turbopack preview builds.
    import('jspdf/dist/jspdf.es.min.js'),
    renderReportPageCanvases({
      elementId,
      isDarkPreview,
    }),
  ]);

  const pdf = new jsPDF({
    compress: true,
    format: 'a4',
    orientation: 'portrait',
    unit: 'mm',
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  for (const [index, canvas] of canvases.entries()) {
    if (index > 0) {
      pdf.addPage('a4', 'portrait');
    }

    const imageRatio = canvas.width / canvas.height;
    let renderWidth = pageWidth;
    let renderHeight = renderWidth / imageRatio;

    if (renderHeight > pageHeight) {
      renderHeight = pageHeight;
      renderWidth = renderHeight * imageRatio;
    }

    const offsetX = (pageWidth - renderWidth) / 2;
    const offsetY = (pageHeight - renderHeight) / 2;

    pdf.addImage(
      canvas.toDataURL('image/png', 1),
      'PNG',
      offsetX,
      offsetY,
      renderWidth,
      renderHeight,
      undefined,
      'FAST'
    );
  }

  await downloadBlob(pdf.output('blob'), buildPdfFilename(metadata));
  onAfterDownload?.();

  return canvases.length;
}

function collectDocumentStylesheets(): string {
  return Array.from(document.styleSheets)
    .map((styleSheet) => {
      try {
        if (styleSheet.href) {
          return `<link rel="stylesheet" href="${styleSheet.href}">`;
        }

        if (styleSheet.ownerNode) {
          const styleElement = styleSheet.ownerNode as HTMLStyleElement;
          return `<style>${styleElement.innerHTML}</style>`;
        }
      } catch (_e) {
        if (styleSheet.href) {
          return `<link rel="stylesheet" href="${styleSheet.href}">`;
        }
      }

      return '';
    })
    .join('\n');
}

function openReportPrintPreview({
  previewTitle,
  t,
  targetWindow,
}: {
  previewTitle: string;
  t: ReturnType<typeof useTranslations>;
  targetWindow?: Window | null;
}): boolean {
  const printableArea = document.getElementById('printable-area');
  if (!printableArea) {
    toast.error(t('ws-reports.report_export_not_found'));
    return false;
  }

  const printWindow = targetWindow ?? window.open('', '_blank');
  if (!printWindow) {
    toast.error(t('ws-reports.failed_open_print'));
    return false;
  }

  const escapedTitle = escapeString(previewTitle || t('common.untitled'));
  const printContent = buildReportPrintContent({
    printableAreaHtml: printableArea.outerHTML,
    documentTitle: `${t('ws-reports.report')} - ${escapedTitle}`,
    stylesheets: collectDocumentStylesheets(),
  });

  printWindow.document.open();
  printWindow.document.write(printContent);
  printWindow.document.close();

  return true;
}

export function useReportExport({
  previewTitle,
  isDarkPreview,
  userName,
  groupName,
  isPaginationReady,
}: {
  previewTitle: string;
  isDarkPreview: boolean;
  userName?: string;
  groupName?: string;
  isPaginationReady: boolean;
}): {
  handlePdfExport: () => Promise<void>;
  handlePrintExport: () => void;
  handlePngExport: () => Promise<void>;
  isExporting: boolean;
  defaultExportType: ExportType;
  setDefaultExportType: (
    value: ExportType | ((val: ExportType) => ExportType)
  ) => void;
  printAfterExport: boolean;
  setPrintAfterExport: (value: boolean | ((val: boolean) => boolean)) => void;
} {
  const t = useTranslations();
  const [isExporting, setIsExporting] = useState(false);
  const [storedDefaultExportType, setStoredDefaultExportType] = useLocalStorage<
    ExportType | 'print'
  >('report-export-type', 'pdf');
  const [storedPrintAfterExport, setStoredPrintAfterExport] =
    useLocalStorage<unknown>('report-print-after-export', false);
  const printAfterExport = normalizePrintAfterExportPreference(
    storedPrintAfterExport
  );
  const printAfterExportRef = useRef(printAfterExport);

  const defaultExportType: ExportType =
    storedDefaultExportType === 'image' ? 'image' : 'pdf';

  const setDefaultExportType = useCallback(
    (value: ExportType | ((val: ExportType) => ExportType)) => {
      setStoredDefaultExportType((prev) => {
        const normalizedPrev: ExportType = prev === 'image' ? 'image' : 'pdf';
        return value instanceof Function ? value(normalizedPrev) : value;
      });
    },
    [setStoredDefaultExportType]
  );

  useEffect(() => {
    if (storedDefaultExportType === 'print') {
      setStoredDefaultExportType('pdf');
    }
  }, [setStoredDefaultExportType, storedDefaultExportType]);

  const setPrintAfterExport = useCallback(
    (value: boolean | ((val: boolean) => boolean)) => {
      setStoredPrintAfterExport((prev: unknown) => {
        const normalizedPrev = normalizePrintAfterExportPreference(prev);
        return value instanceof Function ? value(normalizedPrev) : value;
      });
    },
    [setStoredPrintAfterExport]
  );

  useEffect(() => {
    printAfterExportRef.current = printAfterExport;
  }, [printAfterExport]);

  useEffect(() => {
    if (storedPrintAfterExport !== printAfterExport) {
      setStoredPrintAfterExport(printAfterExport);
    }
  }, [printAfterExport, setStoredPrintAfterExport, storedPrintAfterExport]);

  const handlePrintExport = () => {
    if (!isPaginationReady) {
      toast.error(t('ws-reports.export_waiting_for_layout'));
      return;
    }

    openReportPrintPreview({
      previewTitle,
      t,
    });
  };

  const handlePdfExport = async () => {
    if (!isPaginationReady) {
      toast.error(t('ws-reports.export_waiting_for_layout'));
      return;
    }

    const shouldPrintAfterExport = printAfterExportRef.current;
    let printWindow: Window | null = null;
    if (shouldPrintAfterExport) {
      printWindow = window.open('', '_blank');
    }

    setIsExporting(true);
    try {
      await exportReportAsPdf({
        elementId: 'printable-area',
        isDarkPreview,
        metadata: {
          title: previewTitle,
          userName,
          groupName,
        },
        onAfterDownload: () => {
          if (!shouldPrintAfterExport) {
            return;
          }

          const didOpen = openReportPrintPreview({
            previewTitle,
            t,
            targetWindow: printWindow,
          });

          if (!didOpen && printWindow && !printWindow.closed) {
            printWindow.close();
          }
        },
      });
      toast.success(t('ws-reports.export_pdf_success'));
    } catch (error) {
      if (printWindow && !printWindow.closed) {
        printWindow.close();
      }
      console.error('PDF export failed:', error);
      toast.error(t('ws-reports.failed_export_pdf'));
    } finally {
      setIsExporting(false);
    }
  };

  const handlePngExport = async () => {
    if (!isPaginationReady) {
      toast.error(t('ws-reports.export_waiting_for_layout'));
      return;
    }

    setIsExporting(true);
    try {
      const pageCount = await exportReportAsPng({
        elementId: 'printable-area',
        isDarkPreview,
        metadata: {
          title: previewTitle,
          userName,
          groupName,
        },
      });
      toast.success(
        pageCount > 1
          ? t('ws-reports.export_png_success_multi', {
              count: pageCount,
            })
          : t('ws-reports.export_png_success')
      );
    } catch (error) {
      console.error('PNG export failed:', error);
      toast.error(t('ws-reports.failed_export_png'));
    } finally {
      setIsExporting(false);
    }
  };

  return {
    handlePdfExport,
    handlePrintExport,
    handlePngExport,
    isExporting,
    defaultExportType,
    setDefaultExportType,
    printAfterExport,
    setPrintAfterExport,
  };
}

export function useBulkReportExport<TReport>({
  open,
  onOpenChange,
  reports,
  isDarkPreview,
  getMetadata,
  elementId = 'bulk-export-printable-area',
  renderWaitMs = 500,
}: UseBulkReportExportOptions<TReport>): {
  currentReport: TReport | null;
  isProcessing: boolean;
  completedCount: number;
  progress: number;
} {
  const t = useTranslations();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [completedCount, setCompletedCount] = useState(0);
  const isProcessingCurrentRef = useRef(false);

  const currentReport = reports[currentIndex] ?? null;

  const reset = useCallback(() => {
    setCurrentIndex(0);
    setCompletedCount(0);
    setIsProcessing(false);
    isProcessingCurrentRef.current = false;
  }, []);

  const processCurrentReport = useCallback(async () => {
    if (
      !open ||
      !isProcessing ||
      !currentReport ||
      isProcessingCurrentRef.current
    )
      return;

    isProcessingCurrentRef.current = true;
    try {
      await new Promise((resolve) => setTimeout(resolve, renderWaitMs));
      await exportReportAsPng({
        elementId,
        isDarkPreview,
        metadata: getMetadata(currentReport),
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
      console.error('Bulk PNG export failed:', error);
      toast.error(t('ws-reports.failed_export_png'));
      setIsProcessing(false);
    } finally {
      isProcessingCurrentRef.current = false;
    }
  }, [
    currentIndex,
    currentReport,
    elementId,
    getMetadata,
    isDarkPreview,
    isProcessing,
    onOpenChange,
    open,
    renderWaitMs,
    reports.length,
    t,
  ]);

  useEffect(() => {
    if (open && reports.length > 0 && !isProcessing && completedCount === 0) {
      setIsProcessing(true);
    }
  }, [completedCount, isProcessing, open, reports.length]);

  useEffect(() => {
    if (isProcessing) {
      void processCurrentReport();
    }
  }, [isProcessing, processCurrentReport]);

  useEffect(() => {
    if (!open) {
      reset();
    }
  }, [open, reset]);

  const progress =
    reports.length > 0
      ? Math.round((completedCount / reports.length) * 100)
      : 0;

  return {
    currentReport,
    isProcessing,
    completedCount,
    progress,
  };
}
