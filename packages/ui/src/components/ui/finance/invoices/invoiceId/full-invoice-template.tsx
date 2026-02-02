import type {
  Invoice,
  InvoiceProduct,
  InvoicePromotion,
} from '@tuturuuu/types';
import type { WorkspaceConfig } from '@tuturuuu/types/primitives/WorkspaceConfig';
import { Separator } from '@tuturuuu/ui/separator';
import { formatCurrency } from '@tuturuuu/utils/format';
import dayjs from 'dayjs';
import { useTranslations } from 'next-intl';

export function FullInvoiceTemplate({
  invoice,
  products,
  promotions,
  configs,
  isDarkPreview,
  currency = 'VND',
  currencyLocale = 'vi-VN',
}: {
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
  configs: WorkspaceConfig[];
  isDarkPreview: boolean;
  currency?: string;
  currencyLocale?: string;
}) {
  const t = useTranslations();
  const getConfig = (id: string) => configs.find((c) => c.id === id)?.value;

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
    <>
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
                {formatCurrency(product.price, currencyLocale, currency, {
                  signDisplay: 'never',
                })}
              </td>
              <td
                className={`py-2 text-right ${isDarkPreview ? 'text-foreground/70' : 'text-black'}`}
              >
                {formatCurrency(
                  product.amount * product.price,
                  currencyLocale,
                  currency,
                  { signDisplay: 'never' }
                )}
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
                : formatCurrency(promo.value, currencyLocale, currency, {
                    signDisplay: 'never',
                  })}
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
          {formatCurrency(subtotal, currencyLocale, currency, {
            signDisplay: 'never',
          })}
        </p>
        {promotions.length > 0 && (
          <p
            className={`mb-2 ${isDarkPreview ? 'text-foreground/70' : 'text-black'}`}
          >
            <span className="font-semibold">
              {t('invoices.discounts')}: {''}
            </span>
            {'-'}
            {formatCurrency(discount_amount, currencyLocale, currency, {
              signDisplay: 'never',
            })}
          </p>
        )}
        {invoice.total_diff !== 0 && (
          <p
            className={`mb-2 ${isDarkPreview ? 'text-foreground/70' : 'text-black'}`}
          >
            <span className="font-semibold">{t('invoices.rounding')}:</span>{' '}
            {formatCurrency(invoice.total_diff, currencyLocale, currency, {
              signDisplay: 'never',
            })}
          </p>
        )}
        <Separator className="my-2" />
        <p
          className={`text-xl ${isDarkPreview ? 'text-foreground/70' : 'text-black'}`}
        >
          <span className="font-bold">{t('invoices.total')}:</span>{' '}
          <span className="font-semibold">
            {formatCurrency(
              invoice.price + invoice.total_diff,
              currencyLocale,
              currency,
              { signDisplay: 'never' }
            )}
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
      {(invoice.creator_id ||
        invoice.platform_creator_id ||
        invoice.creator?.full_name ||
        invoice.creator?.display_name) && (
        <div className="mb-8">
          <h3
            className={`mb-2 font-semibold ${isDarkPreview ? 'text-foreground/70' : 'text-black'}`}
          >
            {t('ws-invoices.creator')}:
          </h3>
          <p
            className={`${isDarkPreview ? 'text-foreground/70' : 'text-black'}`}
          >
            {invoice.creator?.full_name || invoice.creator?.display_name}
          </p>
        </div>
      )}
    </>
  );
}
