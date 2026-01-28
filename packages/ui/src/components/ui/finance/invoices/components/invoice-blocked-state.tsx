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
    <div className="mt-4 flex flex-col items-center justify-center gap-4 rounded-lg border border-amber-200 bg-amber-50 p-8 text-center dark:border-amber-900/50 dark:bg-amber-950/20">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/40">
        <AlertTriangle className="h-6 w-6 text-amber-600 dark:text-amber-500" />
      </div>
      <div className="space-y-1">
        <h3 className="font-semibold text-amber-900 dark:text-amber-400">
          {title}
        </h3>
        <p className="max-w-xs text-amber-800 text-sm dark:text-amber-500">
          {description}
        </p>
      </div>
    </div>
  );
}
