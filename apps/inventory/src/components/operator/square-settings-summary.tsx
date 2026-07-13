'use client';

import type {
  InventorySquareAppCredential,
  InventorySquareConnection,
  InventorySquareEnvironment,
  InventorySquareSettings,
} from '@tuturuuu/internal-api/inventory';
import { useTranslations } from 'next-intl';
import { ReadOnlyField } from './payment-read-only-fields';

export function SquareSettingsSummary({
  appCredential,
  connection,
  environment,
  settings,
}: {
  appCredential?: InventorySquareAppCredential;
  connection?: InventorySquareConnection;
  environment: InventorySquareEnvironment;
  settings?: InventorySquareSettings;
}) {
  const t = useTranslations('inventory.operator.square');
  const isActiveEnvironment = settings?.environment === environment;
  const terminal =
    isActiveEnvironment && environment === 'sandbox'
      ? settings?.sandboxDeviceId || settings?.deviceName
      : isActiveEnvironment
        ? settings?.deviceName
        : undefined;

  return (
    <div className="grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
      <ReadOnlyField
        label={t('environmentLabel')}
        value={t(`environment.${environment}`)}
      />
      <ReadOnlyField
        label={t('summaryConnection')}
        value={
          connection?.accessTokenLast4
            ? t('tokenEnding', { last4: connection.accessTokenLast4 })
            : t('notConfigured')
        }
      />
      <ReadOnlyField
        label={t('summaryApplication')}
        value={appCredential?.applicationId || t('notConfigured')}
      />
      <ReadOnlyField
        label={t('locationLabel')}
        value={
          isActiveEnvironment && settings?.locationName
            ? settings.locationName
            : t('notConfigured')
        }
      />
      <ReadOnlyField
        label={t('deviceLabel')}
        value={terminal || t('notConfigured')}
      />
      <ReadOnlyField
        label={t('summaryWebhook')}
        value={
          connection?.webhookSignatureKeyLast4
            ? t('webhookSignatureEnding', {
                last4: connection.webhookSignatureKeyLast4,
              })
            : t('webhookSignatureMissing')
        }
      />
    </div>
  );
}
