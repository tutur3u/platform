'use client';

import { Invoice, InvoiceProduct, InvoicePromotion } from '@tutur3u/types/db';
import { WorkspaceConfig } from '@tutur3u/types/primitives/WorkspaceConfig';
import { Button } from '@tutur3u/ui/button';
import { Separator } from '@tutur3u/ui/separator';
import dayjs from 'dayjs';
import html2canvas from 'html2canvas';
import { ImageIcon, PrinterIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useRef } from 'react';

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
  };
  products: InvoiceProduct[];
  promotions: InvoicePromotion[];
}) {
  const t = useTranslations();
  const getConfig = (id: string) => configs.find((c) => c.id === id)?.value;

  const printableRef = useRef<HTMLDivElement>(null);

  const handlePrint = useCallback(() => {
    const printContent = printableRef.current;
    if (!printContent) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Please allow popups for this website');
      return;
    }

    // Convert classes to inline styles
    const styledContent = printContent.cloneNode(true) as HTMLElement;
    const elements = styledContent.getElementsByTagName('*');
    for (let i = 0; i < elements.length; i++) {
      const el = elements[i] as HTMLElement;
      const computedStyle = window.getComputedStyle(
        printContent.getElementsByTagName('*')[i] as Element
      );
      el.style.cssText = Array.from(computedStyle).reduce((str, property) => {
        return `${str}${property}:${computedStyle.getPropertyValue(property)};`;
      }, el.style.cssText);
    }

    const printStyles = `
      <style>
        @page {
          size: A5;
          margin: 0;
          margin-right: 10mm;
        }
        html, body {
          margin: 0;
          padding: 0;
          width: 100%;
          height: 100%;
        }
        body {
          display: flex;
          justify-content: center;
          align-items: flex-start;
        }
        #invoice-container {
          width: 100%;
          height: 100%;
          padding: 10mm;
          box-sizing: border-box;
          font-size: 10px;
        }
        table {
          width: 100% !important;
        }
        td, th {
          padding: 2px !important;
        }
        @media print {
          html, body {
            width: 148mm;
            height: 210mm;
          }
          #invoice-container {
            page-break-after: always;
          }
        }
      </style>
    `;

    printWindow.document.write(`
      <html>
        <head>
          ${printStyles}
        </head>
        <body>
          <div id="invoice-container">
            ${styledContent.outerHTML}
          </div>
        </body>
      </html>
    `);

    printWindow.document.close();

    // Use setTimeout to ensure the content is loaded before printing
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 500);
  }, []);

  const handleDownload = useCallback(() => {
    const element = document.getElementById('printable-area');
    if (element) {
      html2canvas(element).then((canvas) => {
        const link = document.createElement('a');
        link.download = `invoice-${invoice.id}.png`;
        link.href = canvas.toDataURL();
        link.click();
      });
    }
  }, [invoice.id]);

  return (
    <div className="overflow-x-auto xl:flex-none">
      <div className="mx-auto h-fit w-full max-w-4xl flex-none rounded-xl shadow-lg dark:bg-foreground/10 print:bg-white print:text-black print:shadow-none">
        <div
          ref={printableRef}
          id="printable-area"
          className="h-full rounded-lg border p-6 text-foreground md:p-12"
        >
          {/* Header */}
          <div className="mb-8 flex flex-wrap items-center justify-between gap-8">
            <div className="flex-1">
              {getConfig('BRAND_LOGO_URL') && (
                <img
                  src={getConfig('BRAND_LOGO_URL')!}
                  alt="logo"
                  className="max-h-20 object-contain"
                />
              )}
            </div>
            <div className="flex-1 text-right">
              <h1 className="mb-2 text-3xl font-bold">
                {t('invoices.invoice')}
              </h1>
              <p className="text-xs text-foreground/70 print:text-black">
                #{invoice.id}
              </p>
            </div>
          </div>

          {/* Company Info */}
          <div className="mb-8 text-center">
            {getConfig('BRAND_NAME') && (
              <h2 className="text-xl font-bold">{getConfig('BRAND_NAME')}</h2>
            )}
            {getConfig('BRAND_LOCATION') && (
              <p className="text-foreground/70 print:text-black">
                {getConfig('BRAND_LOCATION')}
              </p>
            )}
            {getConfig('BRAND_PHONE_NUMBER') && (
              <p className="text-foreground/70 print:text-black">
                {getConfig('BRAND_PHONE_NUMBER')}
              </p>
            )}
          </div>

          <Separator className="my-8" />

          {/* Invoice Details */}
          <div className="mb-8 flex justify-between">
            <div>
              <h3 className="mb-2 font-semibold">{t('invoices.bill_to')}:</h3>
              <p>
                {invoice.customer_full_name || invoice.customer_display_name}
              </p>
            </div>
            <div className="text-right">
              {invoice.created_at && (
                <p>
                  <span className="font-semibold">
                    {t('invoices.invoice_date')}:
                  </span>{' '}
                  {dayjs(invoice.created_at).format('DD/MM/YYYY')}
                </p>
              )}
            </div>
          </div>

          {/* Products Table */}
          <table className="mb-8 w-full">
            <thead className="w-full">
              <tr className="border-b">
                <th className="py-2 text-left">{t('invoices.description')}</th>
                <th className="py-2 text-right">{t('invoices.quantity')}</th>
                <th className="py-2 text-right">{t('invoices.price')}</th>
                <th className="py-2 text-right">{t('invoices.total')}</th>
              </tr>
            </thead>
            <tbody className="w-full">
              {products.map((product) => (
                <tr key={product.product_id} className="border-b">
                  <td className="py-2">{product.product_name}</td>
                  <td className="py-2 text-right">{product.amount}</td>
                  <td className="py-2 text-right">
                    {formatCurrency(product.price, 'VND')}
                  </td>
                  <td className="py-2 text-right">
                    {formatCurrency(product.amount * product.price, 'VND')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Promotions */}
          {promotions.length > 0 && (
            <div className="mb-8">
              <h3 className="mb-2 font-semibold">
                {t('invoices.promotions')}:
              </h3>
              {promotions.map((promo) => (
                <p key={promo.promo_id}>
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
            <p className="mb-2">
              <span className="font-semibold">{t('invoices.subtotal')}:</span>{' '}
              {formatCurrency(
                invoice.price +
                  promotions.reduce((total, promo) => {
                    if (promo.use_ratio) {
                      return total + (invoice.price * promo.value) / 100;
                    }
                    return total + promo.value;
                  }, 0),
                'VND'
              )}
            </p>
            {promotions.length > 0 && (
              <p className="mb-2">
                <span className="font-semibold">
                  {t('invoices.discounts')}:
                </span>{' '}
                {formatCurrency(
                  promotions.reduce((total, promo) => {
                    if (promo.use_ratio) {
                      return total + (invoice.price * promo.value) / 100;
                    }
                    return total + promo.value;
                  }, 0),
                  'VND'
                )}
              </p>
            )}
            <p className="mb-2">
              <span className="font-semibold">{t('invoices.rounding')}:</span>{' '}
              {formatCurrency(invoice.total_diff, 'VND')}
            </p>
            <Separator className="my-2" />
            <p className="text-xl">
              <span className="font-bold">{t('invoices.total')}:</span>{' '}
              <span className="font-semibold">
                {formatCurrency(invoice.price + invoice.total_diff, 'VND')}
              </span>
            </p>
          </div>
        </div>
      </div>
      <div className="mt-4 flex justify-end space-x-2 print:hidden">
        <Button variant="outline" onClick={handleDownload}>
          <ImageIcon className="mr-2 h-4 w-4" />
          {t('invoices.download_image')}
        </Button>
        <Button onClick={handlePrint}>
          <PrinterIcon className="mr-2 h-4 w-4" />
          {t('invoices.print')}
        </Button>
      </div>
    </div>
  );
}
