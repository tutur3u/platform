import type { Invoice } from '@tuturuuu/types';
import type { WorkspaceConfig } from '@tuturuuu/types/primitives/WorkspaceConfig';
import { Separator } from '@tuturuuu/ui/separator';
import { formatCurrency } from '@tuturuuu/utils/format';
import dayjs from 'dayjs';
import { useTranslations } from 'next-intl';

export function CompactInvoiceTemplate({
  invoice,
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
  configs: WorkspaceConfig[];
  isDarkPreview: boolean;
  lang: string;
  currency?: string;
}) {
  const t = useTranslations();
  const getConfig = (id: string) => configs.find((c) => c.id === id)?.value;
  const BRAND_LOGO_URL = getConfig('BRAND_LOGO_URL');
  const BRAND_LOCATION = getConfig('BRAND_LOCATION');
  const BRAND_PHONE_NUMBER = getConfig('BRAND_PHONE_NUMBER');

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-8">
        <div className="flex-1">
          {BRAND_LOGO_URL && (
            // biome-ignore lint/performance/noImgElement: <>
            <img
              src={BRAND_LOGO_URL!}
              alt="logo"
              className="max-h-24 object-contain"
            />
          )}
        </div>
        <div className="max-w-75 flex-1 text-center">
          {BRAND_LOCATION && (
            <p
              className={`font-bold text-lg leading-snug print:text-black ${isDarkPreview ? 'text-foreground/70' : 'text-black'}`}
            >
              {BRAND_LOCATION}
            </p>
          )}
          {BRAND_PHONE_NUMBER && (
            <p
              className={`font-bold text-lg print:text-black ${isDarkPreview ? 'text-foreground/70' : 'text-black'}`}
            >
              {BRAND_PHONE_NUMBER}
            </p>
          )}
        </div>
      </div>

      <Separator />

      {/* Bill Bar */}
      <div className="py-1 text-center">
        <h2
          className={`font-bold text-2xl uppercase ${isDarkPreview ? 'text-foreground/70' : 'text-black'}`}
        >
          {t('invoices.bill')}
        </h2>
      </div>

      <Separator />

      {/* Info Section */}
      <div className="flex flex-col gap-4">
        <div className="flex gap-2 text-xl">
          <span
            className={`font-bold ${isDarkPreview ? 'text-foreground/70' : 'text-muted-foreground'}`}
          >
            {t('invoices.name')}:
          </span>
          <span
            className={`font-bold ${isDarkPreview ? 'text-foreground/70' : 'text-black'}`}
          >
            {invoice.customer_full_name || invoice.customer_display_name}
          </span>
        </div>

        <div className="flex gap-2 text-xl">
          <span
            className={`font-bold ${isDarkPreview ? 'text-foreground/70' : 'text-muted-foreground'}`}
          >
            {t('invoices.billing_amount')}:
          </span>
          <span
            className={`font-bold ${isDarkPreview ? 'text-foreground/70' : 'text-black'}`}
          >
            {formatCurrency(
              invoice.price + invoice.total_diff,
              currency,
              undefined,
              { signDisplay: 'never' }
            )}
          </span>
        </div>

        <div className="flex gap-2 text-xl leading-relaxed">
          <span
            className={`shrink-0 font-bold ${isDarkPreview ? 'text-foreground/70' : 'text-muted-foreground'}`}
          >
            {t('invoices.billing_content')}:
          </span>
          <span
            className={`font-bold ${isDarkPreview ? 'text-foreground/70' : 'text-black'}`}
          >
            {invoice.notice}
          </span>
        </div>
      </div>

      <Separator className="border-dashed" />

      {/* Footer */}
      <div className="flex flex-col items-end gap-1">
        {invoice.created_at && (
          <p
            className={`font-bold text-xl ${isDarkPreview ? 'text-foreground/70' : 'text-black'}`}
          >
            {dayjs(invoice.created_at).locale(lang).format('DD/MM/YYYY')}
          </p>
        )}
        {(invoice.creator_id ||
          invoice.platform_creator_id ||
          invoice.creator?.full_name ||
          invoice.creator?.display_name) && (
          <>
            <p
              className={`font-bold text-muted-foreground ${isDarkPreview ? 'text-foreground/50' : 'text-muted-foreground'}`}
            >
              {t('invoices.receiver')}
            </p>
            <p
              className={`font-bold text-xl ${isDarkPreview ? 'text-foreground/70' : 'text-black'}`}
            >
              {invoice.creator?.full_name || invoice.creator?.display_name}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
