import { AlertTriangle } from '@tuturuuu/icons';
import { useTranslations } from 'next-intl';

interface InvoiceBlockedStateProps {
  type?: 'standard' | 'subscription';
}

export function InvoiceBlockedState({
  type = 'standard',
}: InvoiceBlockedStateProps) {
  const t = useTranslations();

  const title = t('ws-invoices.creation_blocked');
  const description =
    type === 'subscription'
      ? t('ws-invoices.group_blocked_description')
      : t('ws-invoices.user_in_blocked_group_description');

  return (
    <div className="mt-4 flex flex-col items-center justify-center gap-4 rounded-lg border border-dynamic-orange bg-dynamic-orange/10 p-8 text-center dark:border-dynamic-orange/50 dark:bg-dynamic-orange/20">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-dynamic-orange/20 dark:bg-dynamic-orange/40">
        <AlertTriangle className="h-6 w-6 text-dynamic-orange" />
      </div>
      <div className="space-y-1">
        <h3 className="font-semibold text-dynamic-orange">{title}</h3>
        <p className="max-w-xs text-dynamic-orange text-sm">{description}</p>
      </div>
    </div>
  );
}
