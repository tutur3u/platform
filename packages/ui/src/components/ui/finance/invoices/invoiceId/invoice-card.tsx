'use client';

import {
  Download,
  ImageIcon,
  Layout,
  Palette,
  Printer,
} from '@tuturuuu/icons';
import type {
  Invoice,
  InvoiceProduct,
  InvoicePromotion,
} from '@tuturuuu/types';
import type { WorkspaceConfig } from '@tuturuuu/types/primitives/WorkspaceConfig';
import { Button } from '@tuturuuu/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Tabs, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { CompactInvoiceTemplate } from './compact-invoice-template';
import { FullInvoiceTemplate } from './full-invoice-template';
import { useLocalStorage } from '@tuturuuu/ui/hooks/use-local-storage';

export default function InvoiceCard({
  lang,
  configs,
  invoice,
  products,
  promotions,
}: {
  lang: string;
  configs: WorkspaceConfig[];
  invoice: Invoice & {
    customer_display_name: string | null;
    customer_full_name: string | null;
    wallet: {
      name: string | null;
    } | null;
    creator: {
      display_name: string | null;
      full_name: string | null;
    } | null;
  };
  products: InvoiceProduct[];
  promotions: InvoicePromotion[];
}) {
  const t = useTranslations();

  const printableRef = useRef<HTMLDivElement>(null);
  const [isDarkPreview, setIsDarkPreview] = useState(false);
  const [isCompact, setIsCompact, isCompactInitialized] = useLocalStorage(
    'invoice-compact-view',
    false
  );
  const [isExporting, setIsExporting] = useState(false);

  const handlePrintExport = useCallback(() => {
    const printableArea = document.getElementById('printable-area');
    if (!printableArea) return;

    const stylesheets = Array.from(document.styleSheets)
      .map((styleSheet) => {
        try {
          if ((styleSheet as CSSStyleSheet).href) {
            return `<link rel="stylesheet" href="${(styleSheet as CSSStyleSheet).href}">`;
          } else if (styleSheet.ownerNode) {
            const styleElement = styleSheet.ownerNode as HTMLStyleElement;
            return `<style>${styleElement.innerHTML}</style>`;
          }
        } catch (_) {
          if ((styleSheet as CSSStyleSheet).href) {
            return `<link rel="stylesheet" href="${(styleSheet as CSSStyleSheet).href}">`;
          }
        }
        return '';
      })
      .join('\n');

    const printContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>${t('invoices.invoice')} - ${invoice.id}</title>
          <meta name="viewport" content="width=device-width, initial-scale=1">
          ${stylesheets}
          <style>
            body { margin: 0; padding: 20px; font-family: system-ui, -apple-system, sans-serif; background: white; color: black; }
            @media print {
              body { margin: 0; padding: 0; }
              #printable-area { height: auto !important; width: auto !important; max-width: none !important; border: none !important; border-radius: 0 !important; box-shadow: none !important; margin: 0 !important; background: white !important; }
              .print\\:hidden { display: none !important; }
              .print\\:text-black { color: black !important; }
              .print\\:bg-white { background-color: white !important; }
              .print\\:border-0 { border: none !important; }
              .print\\:rounded-none { border-radius: 0 !important; }
              .print\\:h-auto { height: auto !important; }
              .print\\:w-auto { width: auto !important; }
              .print\\:max-w-none { max-width: none !important; }
              .print\\:shadow-none { box-shadow: none !important; }
              .print\\:m-0 { margin: 0 !important; }
            }
          </style>
        </head>
        <body>
          ${printableArea.outerHTML}
          <script>
            window.onload = function() {
              setTimeout(() => {
                window.print();
                window.onafterprint = function() { window.close(); };
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
        } catch (_) {}
      };
      printWindow.addEventListener('beforeunload', revoke, { once: true });
      setTimeout(revoke, 60000);
    } else {
      URL.revokeObjectURL(url);
    }
  }, [invoice.id, t]);

  const handlePngExport = useCallback(async () => {
    setIsExporting(true);
    try {
      const html2canvas = (await import('html2canvas-pro')).default;
      const element = document.getElementById('printable-area');
      if (!element) throw new Error('Printable area not found');

      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: isDarkPreview ? '#1a1a1a' : '#ffffff',
        width: element.scrollWidth,
        height: element.scrollHeight,
      });

      canvas.toBlob(
        (blob) => {
          if (!blob) return;
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `invoice-${invoice.id}.png`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
        },
        'image/png',
        1.0
      );
    } finally {
      setIsExporting(false);
    }
  }, [invoice.id, isDarkPreview]);

  // Auto trigger print when URL contains ?print=true
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('print') === 'true') {
        handlePrintExport();
        const url = new URL(window.location.href);
        url.searchParams.delete('print');
        window.history.replaceState({}, '', url.toString());
      }
    } catch (_) {
      // no-op
    }
  }, [handlePrintExport]);

  return (
    <div className="overflow-x-auto xl:flex-none">
      <div className="mb-4 flex justify-end gap-2 print:hidden">


        {isCompactInitialized ? (
          <Tabs
            value={isCompact ? 'compact' : 'full'}
            onValueChange={(value) => setIsCompact(value === 'compact')}
          >
            <TabsList>
              <TabsTrigger value="full" className="gap-2">
                <Layout className="h-4 w-4" />
                {t('invoices.full')}
              </TabsTrigger>
              <TabsTrigger value="compact" className="gap-2">
                <Layout className="h-4 w-4" />
                {t('invoices.compact')}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        ) : (
          <div className="h-10 w-[200px] animate-pulse rounded-md bg-muted" />
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="gap-2">
              <Palette className="h-4 w-4" />
              {t('common.theme')}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setIsDarkPreview(false)}>
              {t('common.light')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setIsDarkPreview(true)}>
              {t('common.dark')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="gap-2">
              <Download className="h-4 w-4" />
              {t('common.export')}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              className="gap-2"
              onClick={(e) => {
                e.preventDefault();
                handlePrintExport();
              }}
            >
              <Printer className="h-4 w-4" />
              {t('invoices.print')}
            </DropdownMenuItem>
            <DropdownMenuItem
              className="gap-2"
              disabled={isExporting}
              onClick={(e) => {
                e.preventDefault();
                handlePngExport();
              }}
            >
              <ImageIcon className="h-4 w-4" />
              {isExporting
                ? t('ws-reports.exporting_png')
                : t('invoices.download_image')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="mx-auto h-fit w-full max-w-4xl flex-none rounded-xl shadow-lg dark:bg-foreground/10 print:bg-white print:text-black print:shadow-none">
        <div
          ref={printableRef}
          id="printable-area"
          className={`h-full rounded-lg border p-6 text-foreground md:p-12 ${isDarkPreview ? 'bg-foreground/10 text-foreground' : 'bg-white text-black'}`}
        >
          {!isCompactInitialized ? (
            <div className="flex h-full min-h-[400px] items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : isCompact ? (
            <CompactInvoiceTemplate
              invoice={invoice}
              configs={configs}
              isDarkPreview={isDarkPreview}
              lang={lang}
            />
          ) : (
            <FullInvoiceTemplate
              invoice={invoice}
              products={products}
              promotions={promotions}
              configs={configs}
              isDarkPreview={isDarkPreview}
            />
          )}
        </div>
      </div>
    </div>
  );
}
