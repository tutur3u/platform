import { Loader2 } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';

export function SubscriptionCreateAction({
  onCreate,
  blockedReason,
  creating,
  disabled,
}: {
  onCreate: () => Promise<void>;
  blockedReason?:
    | 'invalid_subscription_inventory'
    | 'subscription_context_not_ready';
  creating: boolean;
  disabled: boolean;
}) {
  const t = useTranslations();
  return (
    <>
      {blockedReason && (
        <p role="alert" className="text-destructive text-sm">
          {t(`ws-invoices.${blockedReason}`)}
        </p>
      )}
      <Button
        className="w-full"
        onClick={onCreate}
        disabled={disabled || creating || !!blockedReason}
      >
        {creating ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {t('ws-invoices.creating_subscription_invoice')}
          </>
        ) : (
          t('ws-invoices.create_subscription_invoice')
        )}
      </Button>
    </>
  );
}
