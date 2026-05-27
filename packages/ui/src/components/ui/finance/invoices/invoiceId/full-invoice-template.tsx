import type {
  Invoice,
  InvoiceProduct,
  InvoicePromotion,
} from '@tuturuuu/types';
import type { WorkspaceConfig } from '@tuturuuu/types/primitives/WorkspaceConfig';
import { Separator } from '@tuturuuu/ui/separator';
import { formatCurrency } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { FinanceDisplayAmount } from '../../shared/finance-display-amount';

export function FullInvoiceTemplate({
  invoice,
  products,
  promotions,
  configs,
  isDarkPreview,
  lang,
  currency = 'VND',
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
  lang: string;
  currency?: string;
}) {
  const t = useTranslations();
  const getConfig = (id: string) => configs.find((c) => c.id === id)?.value;
  const brandName = getConfig('BRAND_NAME');
  const brandLogoAlt = brandName
    ? t('invoices.brand_logo_alt', { brand: brandName })
    : t('invoices.logo_alt');
  const invoiceDate = invoice.created_at
    ? new Intl.DateTimeFormat(lang, {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      }).format(new Date(invoice.created_at))
    : null;

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
              alt={brandLogoAlt}
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
        {brandName && (
          <h2
            className={`font-bold text-xl ${isDarkPreview ? 'text-foreground/70' : 'text-black'}`}
          >
            {brandName}
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
          {invoiceDate && (
            <p
              className={`${isDarkPreview ? 'text-foreground/70' : 'text-black'}`}
            >
              <span
                className={`font-semibold ${isDarkPreview ? 'text-foreground/70' : 'text-black'}`}
              >
                {t('invoices.invoice_date')}:
              </span>{' '}
              {invoiceDate}
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
                <FinanceDisplayAmount
                  value={formatCurrency(product.price, currency, undefined, {
                    signDisplay: 'never',
                  })}
                />
              </td>
              <td
                className={`py-2 text-right ${isDarkPreview ? 'text-foreground/70' : 'text-black'}`}
              >
                <FinanceDisplayAmount
                  value={formatCurrency(
                    product.amount * product.price,
                    currency,
                    undefined,
                    { signDisplay: 'never' }
                  )}
                />
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
              <FinanceDisplayAmount
                value={
                  promo.use_ratio
                    ? `${promo.value}%`
                    : formatCurrency(promo.value, currency, undefined, {
                        signDisplay: 'never',
                      })
                }
              />
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
          <FinanceDisplayAmount
            value={formatCurrency(subtotal, currency, undefined, {
              signDisplay: 'never',
            })}
          />
        </p>
        {promotions.length > 0 && (
          <p
            className={`mb-2 ${isDarkPreview ? 'text-foreground/70' : 'text-black'}`}
          >
            <span className="font-semibold">
              {t('invoices.discounts')}: {''}
            </span>
            <FinanceDisplayAmount
              value={`-${formatCurrency(discount_amount, currency, undefined, {
                signDisplay: 'never',
              })}`}
            />
          </p>
        )}
        {invoice.total_diff !== 0 && (
          <p
            className={`mb-2 ${isDarkPreview ? 'text-foreground/70' : 'text-black'}`}
          >
            <span className="font-semibold">{t('invoices.rounding')}:</span>{' '}
            <FinanceDisplayAmount
              value={formatCurrency(invoice.total_diff, currency, undefined, {
                signDisplay: 'never',
              })}
            />
          </p>
        )}
        <Separator className="my-2" />
        <p
          className={`text-xl ${isDarkPreview ? 'text-foreground/70' : 'text-black'}`}
        >
          <span className="font-bold">{t('invoices.total')}:</span>{' '}
          <span className="font-semibold">
            <FinanceDisplayAmount
              value={formatCurrency(
                invoice.price + invoice.total_diff,
                currency,
                undefined,
                { signDisplay: 'never' }
              )}
            />
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
