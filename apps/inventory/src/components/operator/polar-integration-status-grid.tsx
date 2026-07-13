'use client';

import { ShieldCheck, Webhook } from '@tuturuuu/icons';
import type {
  InventoryPolarEnvironment,
  InventoryPolarIntegration,
} from '@tuturuuu/internal-api/inventory';
import { useTranslations } from 'next-intl';

const environments: InventoryPolarEnvironment[] = ['sandbox', 'production'];

export function PolarIntegrationStatusGrid({
  integrations,
}: {
  integrations: InventoryPolarIntegration[];
}) {
  const t = useTranslations('inventory.operator.polar');

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {environments.map((environment) => {
        const integration = integrations.find(
          (item) => item.environment === environment
        );
        const ready = integration?.status === 'ready';

        return (
          <article
            className="rounded-lg border border-border bg-card p-4"
            key={environment}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-medium">{t(`environment.${environment}`)}</p>
                <p className="text-muted-foreground text-xs">
                  {integration?.accessTokenLast4
                    ? t('tokenEnding', { last4: integration.accessTokenLast4 })
                    : t('notConfigured')}
                </p>
              </div>
              <span className="inline-flex h-7 items-center gap-2 rounded-md border border-border px-2 text-xs">
                <ShieldCheck className="size-3.5" />
                {ready ? t('ready') : (integration?.status ?? t('pending'))}
              </span>
            </div>
            <p className="mt-3 text-muted-foreground text-xs">
              {integration?.polarProductId
                ? t('productReady', { productId: integration.polarProductId })
                : t('productMissing')}
            </p>
            <p className="mt-2 inline-flex items-center gap-1.5 text-muted-foreground text-xs">
              <Webhook className="size-3.5" />
              {integration?.webhookSecretLast4
                ? t('webhookSecretEnding', {
                    last4: integration.webhookSecretLast4,
                  })
                : t('webhookNotConfigured')}
            </p>
            {integration?.lastError ? (
              <p className="mt-3 rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-destructive text-xs">
                {integration.lastError}
              </p>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}
