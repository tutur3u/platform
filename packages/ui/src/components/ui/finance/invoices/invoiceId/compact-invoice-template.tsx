import type {
  Invoice,
  InvoiceProduct,
  InvoicePromotion,
} from '@tuturuuu/types';
import type { WorkspaceConfig } from '@tuturuuu/types/primitives/WorkspaceConfig';
import { Separator } from '@tuturuuu/ui/separator';
import dayjs from 'dayjs';
import { useTranslations } from 'next-intl';

const formatCurrency = (amount: number, currency: string) => {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(
    amount
  );
};

export function CompactInvoiceTemplate({
  invoice,
  configs,
  isDarkPreview,
  lang,
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
}) {
  const t = useTranslations();
  const getConfig = (id: string) => configs.find((c) => c.id === id)?.value;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex justify-between gap-8 items-center">
        <div className="flex-1">
          {getConfig('BRAND_LOGO_URL') && (
            // biome-ignore lint/performance/noImgElement: <>
            <img
              src={getConfig('BRAND_LOGO_URL')!}
              alt="logo"
              className="max-h-24 object-contain"
            />
          )}
        </div>
        <div className="flex-1 text-center max-w-[300px]">
          {getConfig('BRAND_LOCATION') && (
            <p
              className={`font-bold text-lg leading-snug print:text-black ${isDarkPreview ? 'text-foreground/70' : 'text-black'}`}
            >
              {getConfig('BRAND_LOCATION')}
            </p>
          )}
          {getConfig('BRAND_PHONE_NUMBER') && (
            <p
              className={`font-bold text-lg print:text-black ${isDarkPreview ? 'text-foreground/70' : 'text-black'}`}
            >
              {getConfig('BRAND_PHONE_NUMBER')}
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
            {formatCurrency(invoice.price + invoice.total_diff, 'VND')}
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
        <p
          className={`font-bold text-xl ${isDarkPreview ? 'text-foreground/70' : 'text-black'}`}
        >
          {dayjs(invoice.created_at).locale(lang).format('DD/MM/YYYY')}
        </p>
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
      </div>
    </div>
  );
}
