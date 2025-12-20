'use client';

import { Download, ImageIcon, Palette, Printer } from '@tuturuuu/icons';
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
import { Separator } from '@tuturuuu/ui/separator';
import dayjs from 'dayjs';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';

// Add this utility function at the top of the file
const formatCurrency = (amount: number, currency: string) => {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(
    amount
  );
};

export default function InvoiceCard({
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
  const getConfig = (id: string) => configs.find((c) => c.id === id)?.value;

  const printableRef = useRef<HTMLDivElement>(null);
  const [isDarkPreview, setIsDarkPreview] = useState(false);
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

  const subtotal = products.reduce((total, product) => {
    return total + product.price * product.amount;
  }, 0);

  const discount_amount = promotions.reduce((total, promo) => {
    if (promo.use_ratio) {
      return total + (subtotal * promo.value) / 100;
    }
    return total + promo.value;
  }, 0);

  return (
    <div className="overflow-x-auto xl:flex-none">
      <div className="mb-4 flex justify-end gap-2 print:hidden">
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
      </div>
      <div className="mx-auto h-fit w-full max-w-4xl flex-none rounded-xl shadow-lg dark:bg-foreground/10 print:bg-white print:text-black print:shadow-none">
        <div
          ref={printableRef}
          id="printable-area"
          className={`h-full rounded-lg border p-6 text-foreground md:p-12 ${isDarkPreview ? 'bg-foreground/10 text-foreground' : 'bg-white text-black'}`}
        >
          {/* Header */}
          <div className="mb-8 flex flex-wrap items-center justify-between gap-8">
            <div className="flex-1">
              {getConfig('BRAND_LOGO_URL') && (
                // biome-ignore lint/performance/noImgElement: <>
                <img
                  src={getConfig('BRAND_LOGO_URL')!}
                  alt="logo"
                  className="max-h-20 object-contain"
                />
              )}
            </div>
            <div className="flex-1 text-right">
              <h1
                className={`mb-2 font-bold text-3xl ${isDarkPreview ? 'text-foreground/70' : 'text-black'}`}
              >
                {t('invoices.invoice')}
              </h1>
              <p
                className={`text-xs print:text-black ${isDarkPreview ? 'text-foreground/70' : 'text-black'}`}
              >
                #{invoice.id}
              </p>
            </div>
          </div>

          {/* Company Info */}
          <div className="mb-8 text-center">
            {getConfig('BRAND_NAME') && (
              <h2
                className={`font-bold text-xl ${isDarkPreview ? 'text-foreground/70' : 'text-black'}`}
              >
                {getConfig('BRAND_NAME')}
              </h2>
            )}
            {getConfig('BRAND_LOCATION') && (
              <p
                className={`print:text-black ${isDarkPreview ? 'text-foreground/70' : 'text-black'}`}
              >
                {getConfig('BRAND_LOCATION')}
              </p>
            )}
            {getConfig('BRAND_PHONE_NUMBER') && (
              <p
                className={`print:text-black ${isDarkPreview ? 'text-foreground/70' : 'text-black'}`}
              >
                {getConfig('BRAND_PHONE_NUMBER')}
              </p>
            )}
          </div>

          <Separator className="my-8" />

          {/* Invoice Details */}
          <div className="mb-8 flex justify-between">
            <div>
              <h3
                className={`mb-2 font-semibold ${isDarkPreview ? 'text-foreground/70' : 'text-black'}`}
              >
                {t('invoices.bill_to')}:
              </h3>
              <p
                className={`${isDarkPreview ? 'text-foreground/70' : 'text-black'}`}
              >
                {invoice.customer_full_name || invoice.customer_display_name}
              </p>
            </div>
            <div className="text-right">
              {invoice.created_at && (
                <p
                  className={`${isDarkPreview ? 'text-foreground/70' : 'text-black'}`}
                >
                  <span
                    className={`font-semibold ${isDarkPreview ? 'text-foreground/70' : 'text-black'}`}
                  >
                    {t('invoices.invoice_date')}:
                  </span>{' '}
                  {dayjs(invoice.created_at).format('DD/MM/YYYY')}
                </p>
              )}
            </div>
          </div>

          {/* Invoice Content */}
          <div className="mb-8">
            <h3
              className={`mb-2 font-semibold ${isDarkPreview ? 'text-foreground/70' : 'text-black'}`}
            >
              {t('invoices.content')}:
            </h3>
            <p
              className={`${isDarkPreview ? 'text-foreground/70' : 'text-black'} wrap-break-word text-wrap`}
            >
              {invoice.notice}
            </p>
          </div>

          {/* Products Table */}
          <table className="mb-8 w-full">
            <thead className="w-full">
              <tr className="border-b">
                <th
                  className={`py-2 text-left ${isDarkPreview ? 'text-foreground/70' : 'text-black'}`}
                >
                  {t('invoices.description')}
                </th>
                <th
                  className={`py-2 text-right ${isDarkPreview ? 'text-foreground/70' : 'text-black'}`}
                >
                  {t('invoices.quantity')}
                </th>
                <th
                  className={`py-2 text-right ${isDarkPreview ? 'text-foreground/70' : 'text-black'}`}
                >
                  {t('invoices.price')}
                </th>
                <th
                  className={`py-2 text-right ${isDarkPreview ? 'text-foreground/70' : 'text-black'}`}
                >
                  {t('invoices.total')}
                </th>
              </tr>
            </thead>
            <tbody className="w-full">
              {products.map((product) => (
                <tr key={product.product_id} className="border-b">
                  <td
                    className={`py-2 ${isDarkPreview ? 'text-foreground/70' : 'text-black'}`}
                  >
                    {product.product_name}
                  </td>
                  <td
                    className={`py-2 text-right ${isDarkPreview ? 'text-foreground/70' : 'text-black'}`}
                  >
                    {product.amount}
                  </td>
                  <td
                    className={`py-2 text-right ${isDarkPreview ? 'text-foreground/70' : 'text-black'}`}
                  >
                    {formatCurrency(product.price, 'VND')}
                  </td>
                  <td
                    className={`py-2 text-right ${isDarkPreview ? 'text-foreground/70' : 'text-black'}`}
                  >
                    {formatCurrency(product.amount * product.price, 'VND')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Promotions */}
          {promotions.length > 0 && (
            <div className="mb-8">
              <h3
                className={`mb-2 font-semibold ${isDarkPreview ? 'text-foreground/70' : 'text-black'}`}
              >
                {t('invoices.promotions')}:
              </h3>
              {promotions.map((promo) => (
                <p
                  key={promo.promo_id}
                  className={`${isDarkPreview ? 'text-foreground/70' : 'text-black'}`}
                >
                  {promo.name || promo.code}:{' '}
                  {promo.use_ratio
                    ? `${promo.value}%`
                    : formatCurrency(promo.value, 'VND')}
                </p>
              ))}
            </div>
          )}

          <Separator className="my-2" />
          {/* Total */}
          <div className="text-right">
            <p
              className={`mb-2 ${isDarkPreview ? 'text-foreground/70' : 'text-black'}`}
            >
              <span className="font-semibold">{t('invoices.subtotal')}:</span>{' '}
              {formatCurrency(subtotal, 'VND')}
            </p>
            {promotions.length > 0 && (
              <p
                className={`mb-2 ${isDarkPreview ? 'text-foreground/70' : 'text-black'}`}
              >
                <span className="font-semibold">
                  {t('invoices.discounts')}: {''}
                </span>
                {'-'}
                {formatCurrency(discount_amount, 'VND')}
              </p>
            )}
            <p
              className={`mb-2 ${isDarkPreview ? 'text-foreground/70' : 'text-black'}`}
            >
              <span className="font-semibold">{t('invoices.rounding')}:</span>{' '}
              {formatCurrency(invoice.total_diff, 'VND')}
            </p>
            <Separator className="my-2" />
            <p
              className={`text-xl ${isDarkPreview ? 'text-foreground/70' : 'text-black'}`}
            >
              <span className="font-bold">{t('invoices.total')}:</span>{' '}
              <span className="font-semibold">
                {formatCurrency(invoice.price + invoice.total_diff, 'VND')}
              </span>
            </p>
          </div>

          {/* Wallet */}
          {invoice.wallet && (
            <div className="mb-8">
              <h3
                className={`mb-2 font-semibold ${isDarkPreview ? 'text-foreground/70' : 'text-black'}`}
              >
                {t('ws-wallets.wallet')}:
              </h3>
              <p
                className={`${isDarkPreview ? 'text-foreground/70' : 'text-black'}`}
              >
                {invoice.wallet.name}
              </p>
            </div>
          )}

          {/* Creator */}
          {invoice.creator && (
            <div className="mb-8">
              <h3
                className={`mb-2 font-semibold ${isDarkPreview ? 'text-foreground/70' : 'text-black'}`}
              >
                {t('ws-invoices.creator')}:
              </h3>
              <p
                className={`${isDarkPreview ? 'text-foreground/70' : 'text-black'}`}
              >
                {invoice.creator.full_name || invoice.creator.display_name}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
