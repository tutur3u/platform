'use client';

import { toast } from '@tuturuuu/ui/sonner';
import { escape as escapeString } from 'lodash';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

function sanitizeFilename(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^a-z0-9]/gi, '_')
    .toLowerCase()
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

export function useReportExport({
  previewTitle,
  isDarkPreview,
  userName,
  groupName,
}: {
  previewTitle: string;
  isDarkPreview: boolean;
  userName?: string;
  groupName?: string;
}) {
  const t = useTranslations();
  const [isExporting, setIsExporting] = useState(false);

  const handlePrintExport = () => {
    const printableArea = document.getElementById('printable-area');
    if (!printableArea) {
      toast.error(t('ws-reports.report_export_not_found'));
      return;
    }

    const stylesheets = Array.from(document.styleSheets)
      .map((styleSheet) => {
        try {
          if (styleSheet.href) {
            return `<link rel="stylesheet" href="${styleSheet.href}">`;
          } else if (styleSheet.ownerNode) {
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

    const escapedTitle = escapeString(previewTitle || t('common.untitled'));

    const printContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>${t('ws-reports.report')} - ${escapedTitle}</title>
          <meta name="viewport" content="width=device-width, initial-scale=1">
          ${stylesheets}
          <style>
            body {
              margin: 0;
              padding: 20px;
              font-family: system-ui, -apple-system, sans-serif;
              background: white;
              color: black;
            }
            @media print {
              body {
                margin: 0;
                padding: 0;
              }
              #printable-area {
                height: auto !important;
                width: auto !important;
                max-width: none !important;
                border: none !important;
                border-radius: 0 !important;
                box-shadow: none !important;
                margin: 0 !important;
                background: white !important;
              }
              .print\\:hidden {
                display: none !important;
              }
              .print\\:text-black {
                color: black !important;
              }
              .print\\:bg-white {
                background-color: white !important;
              }
              .print\\:border-black {
                border-color: black !important;
              }
              .print\\:text-red-600 {
                color: #dc2626 !important;
              }
              .print\\:border-0 {
                border: none !important;
              }
              .print\\:rounded-none {
                border-radius: 0 !important;
              }
              .print\\:h-auto {
                height: auto !important;
              }
              .print\\:p-8 {
                padding: 2rem !important;
              }
              .print\\:w-auto {
                width: auto !important;
              }
              .print\\:max-w-none {
                max-width: none !important;
              }
              .print\\:shadow-none {
                box-shadow: none !important;
              }
              .print\\:m-0 {
                margin: 0 !important;
              }
              .print\\:p-4 {
                padding: 1rem !important;
              }
              .print\\:opacity-50 {
                opacity: 0.5 !important;
              }
            }
          </style>
        </head>
        <body>
          ${printableArea.outerHTML}
          <script>
            window.onload = function() {
              setTimeout(() => {
                window.print();
                window.onafterprint = function() {
                  window.close();
                };
              }, 500);
            };
          </script>
        </body>
      </html>
    `;

    const blob = new Blob([printContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const printWindow = window.open(url, '_blank', 'noopener,noreferrer');
    if (printWindow) {
      const revoke = () => {
        try {
          URL.revokeObjectURL(url);
        } catch (_) {
          // no-op
        }
      };
      printWindow.addEventListener('beforeunload', revoke, { once: true });
      setTimeout(revoke, 60_000);
    } else {
      URL.revokeObjectURL(url);
    }
  };

  const handlePngExport = async () => {
    setIsExporting(true);
    try {
      const html2canvas = (await import('html2canvas-pro')).default;
      const printableArea = document.getElementById('printable-area');
      if (!printableArea) {
        throw new Error(t('ws-reports.report_export_not_found'));
      }

      const canvas = await html2canvas(printableArea, {
        scale: 2,
        useCORS: true,
        backgroundColor: isDarkPreview ? '#1a1a1a' : '#ffffff',
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

              const parts = [
                userName && sanitizeFilename(userName),
                groupName && sanitizeFilename(groupName),
                previewTitle ? sanitizeFilename(previewTitle) : 'report',
              ].filter(Boolean);

              const fileName = `${parts.join('_')}.png`;

              link.download = fileName;
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
              URL.revokeObjectURL(url);

              toast.success(t('ws-reports.export_png_success'));
              resolve();
            } catch (error) {
              reject(error);
            }
          },
          'image/png',
          1.0
        );
      });
    } catch (error) {
      console.error('PNG export failed:', error);
      toast.error(t('ws-reports.failed_export_png'));
    } finally {
      setIsExporting(false);
    }
  };

  return {
    handlePrintExport,
    handlePngExport,
    isExporting,
  };
}
