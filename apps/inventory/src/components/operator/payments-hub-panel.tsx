'use client';

import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  CreditCard,
  Link2,
  MonitorCheck,
  Settings2,
  ShieldCheck,
} from '@tuturuuu/icons';
import {
  getInventoryPolarSettings,
  getInventorySquareCatalogSyncState,
  getInventorySquareSettings,
  listInventoryCheckouts,
} from '@tuturuuu/internal-api/inventory';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { useTranslations } from 'next-intl';
import { parseAsStringLiteral, useQueryState } from 'nuqs';
import { OperatorMetricCard } from './operator-dashboard-primitives';
import { PaymentSettingsPanel } from './payment-settings-panel';
import { PaymentVerificationPanel } from './payment-verification-panel';
import { PaymentsReadinessOverview } from './payments-readiness-overview';
import { PolarSyncHealthPanel } from './polar-sync-health-panel';
import { SquareSyncObservabilityPanel } from './square-sync-observability-panel';

const sections = ['setup', 'sync', 'transactions'] as const;
type PaymentsSection = (typeof sections)[number];

export function PaymentsHubPanel({ wsId }: { wsId: string }) {
  const t = useTranslations('inventory.operator.paymentsHub');
  const [section, setSection] = useQueryState(
    'section',
    parseAsStringLiteral(sections)
      .withDefault('setup')
      .withOptions({ shallow: true })
  );
  const polarSettings = useQuery({
    queryFn: () => getInventoryPolarSettings(wsId),
    queryKey: ['inventory', wsId, 'polar-settings'],
  });
  const squareSettings = useQuery({
    queryFn: () => getInventorySquareSettings(wsId),
    queryKey: ['inventory', wsId, 'square-settings'],
  });
  const squareSync = useQuery({
    queryFn: () => getInventorySquareCatalogSyncState(wsId),
    queryKey: ['inventory', wsId, 'square-catalog-sync'],
  });
  const checkouts = useQuery({
    queryFn: () => listInventoryCheckouts(wsId, { pageSize: 50 }),
    queryKey: ['inventory', wsId, 'checkouts', 'payments-hub'],
  });

  const checkoutRows = checkouts.data?.data ?? [];
  const paymentRows = checkoutRows.filter(
    (checkout) => checkout.polarStatus || checkout.squareStatus
  );
  const squareRows = paymentRows.filter((checkout) => checkout.squareStatus);
  const squareLinks = squareSync.data?.links ?? [];
  const verifiedWebhooks = (squareSettings.data?.connections ?? []).filter(
    (connection) => connection.webhookSignatureKeyLast4
  );

  return (
    <div className="grid gap-5">
      <PaymentsReadinessOverview
        checkouts={checkoutRows}
        onOpenSection={(value) => void setSection(value)}
        polarSettings={polarSettings.data}
        squareSettings={squareSettings.data}
        squareSync={squareSync.data}
      />

      <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
        <OperatorMetricCard
          icon={Link2}
          label={t('metrics.squareLinks')}
          tone={squareLinks.length > 0 ? 'success' : 'default'}
          value={squareLinks.length}
        />
        <OperatorMetricCard
          icon={MonitorCheck}
          label={t('metrics.squareTests')}
          tone={squareRows.length > 0 ? 'success' : 'default'}
          value={squareRows.length}
        />
        <OperatorMetricCard
          icon={ShieldCheck}
          label={t('metrics.webhooks')}
          tone={verifiedWebhooks.length > 0 ? 'success' : 'default'}
          value={verifiedWebhooks.length}
        />
      </div>

      <Tabs
        className="min-w-0 gap-4"
        onValueChange={(value) => void setSection(value as PaymentsSection)}
        value={section}
      >
        <TabsList className="grid h-auto w-full grid-cols-3 gap-1 bg-muted/35 p-1">
          <TabsTrigger
            className="min-h-10 min-w-0 touch-manipulation gap-1.5 px-2 py-2 sm:min-h-9 sm:gap-2"
            value="setup"
          >
            <Settings2 className="size-4 max-[380px]:hidden" />
            <span className="truncate">{t('tabs.setup')}</span>
          </TabsTrigger>
          <TabsTrigger
            className="min-h-10 min-w-0 touch-manipulation gap-1.5 px-2 py-2 sm:min-h-9 sm:gap-2"
            value="sync"
          >
            <Activity className="size-4 max-[380px]:hidden" />
            <span className="truncate">{t('tabs.sync')}</span>
          </TabsTrigger>
          <TabsTrigger
            className="min-h-10 min-w-0 touch-manipulation gap-1.5 px-2 py-2 sm:min-h-9 sm:gap-2"
            value="transactions"
          >
            <CreditCard className="size-4 max-[380px]:hidden" />
            <span className="truncate">{t('tabs.transactions')}</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="setup">
          <PaymentSettingsPanel defaultProvider="square" wsId={wsId} />
        </TabsContent>
        <TabsContent className="grid gap-4" value="sync">
          <SquareSyncObservabilityPanel wsId={wsId} />
          <PolarSyncHealthPanel wsId={wsId} />
        </TabsContent>
        <TabsContent value="transactions">
          <PaymentVerificationPanel checkouts={paymentRows} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
