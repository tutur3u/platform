import { Invoice, InvoiceProduct, InvoicePromotion } from '@/types/db';
import { Separator } from '@repo/ui/components/ui/separator';
import dayjs from 'dayjs';

// Add this utility function at the top of the file
const formatCurrency = (amount: number, currency: string) => {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(
    amount
  );
};

export default function InvoiceCard({
  t,
  invoice,
  products,
  promotions,
  getConfig,
}: {
  lang: string;
  invoice: Invoice & {
    customer_display_name: string | null;
    customer_full_name: string | null;
  };
  products: InvoiceProduct[];
  promotions: InvoicePromotion[];
  // eslint-disable-next-line no-unused-vars
  t: any;
  // eslint-disable-next-line no-unused-vars
  getConfig: (id: string) => string | null | undefined;
}) {
  return (
    <div className="overflow-x-auto xl:flex-none">
      <div
        id="printable-area"
        className="dark:bg-foreground/10 mx-auto h-fit w-full max-w-4xl flex-none rounded-xl shadow-lg print:p-4 print:shadow-none"
      >
        <div className="text-foreground h-full rounded-lg border p-6 md:p-12">
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
              <p className="text-foreground/70 text-xs">#{invoice.id}</p>
            </div>
          </div>

          {/* Company Info */}
          <div className="mb-8 text-center">
            {getConfig('BRAND_NAME') && (
              <h2 className="text-xl font-bold">{getConfig('BRAND_NAME')}</h2>
            )}
            {getConfig('BRAND_LOCATION') && (
              <p className="text-foreground/70">
                {getConfig('BRAND_LOCATION')}
              </p>
            )}
            {getConfig('BRAND_PHONE_NUMBER') && (
              <p className="text-foreground/70">
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
            <thead>
              <tr className="border-b">
                <th className="py-2 text-left">{t('invoices.description')}</th>
                <th className="py-2 text-right">{t('invoices.quantity')}</th>
                <th className="py-2 text-right">{t('invoices.price')}</th>
                <th className="py-2 text-right">{t('invoices.total')}</th>
              </tr>
            </thead>
            <tbody>
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
    </div>
  );
}
