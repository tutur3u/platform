'use client';

import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  CreditCard,
  MonitorSmartphone,
  Package,
  Settings2,
  TicketPercent,
  Zap,
} from '@tuturuuu/icons';
import {
  getInventoryPolarSettings,
  getInventorySquareSettings,
  listInventoryCheckouts,
  listInventoryPromotions,
} from '@tuturuuu/internal-api/inventory';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { useTranslations } from 'next-intl';
import { OperatorMetricCard } from './operator-dashboard-primitives';
import { money } from './operator-format';
import { EmptyRow } from './operator-shell';
import { PaymentSettingsPanel } from './payment-settings-panel';
import { PolarSyncHealthPanel } from './polar-sync-health-panel';

function StatusBadge({ value }: { value: string }) {
  return (
    <span className="inline-flex h-6 items-center rounded-md border border-border bg-primary/10 px-2 font-medium text-primary text-xs">
      {value.replaceAll('_', ' ')}
    </span>
  );
}

export function PolarHubPanel({ wsId }: { wsId: string }) {
  const t = useTranslations('inventory.operator.polar.hub');

  const settings = useQuery({
    queryFn: () => getInventoryPolarSettings(wsId),
    queryKey: ['inventory', wsId, 'polar-settings'],
  });
  const squareSettings = useQuery({
    queryFn: () => getInventorySquareSettings(wsId),
    queryKey: ['inventory', wsId, 'square-settings'],
  });
  const checkouts = useQuery({
    queryFn: () => listInventoryCheckouts(wsId, { pageSize: 50 }),
    queryKey: ['inventory', wsId, 'checkouts', 'polar-hub'],
  });
  const promotions = useQuery({
    queryFn: () => listInventoryPromotions(wsId, { pageSize: 100 }),
    queryKey: ['inventory', wsId, 'promotions', 'polar-hub'],
  });

  const integrations = settings.data?.integrations ?? [];
  const readyEnvironments = integrations.filter(
    (integration) => integration.status === 'ready'
  );
  const productsReady = integrations.filter(
    (integration) => integration.polarProductId
  ).length;
  const paymentCheckouts = (checkouts.data?.data ?? []).filter(
    (row) => row.polarStatus || row.squareStatus
  );
  const squareConnections = (squareSettings.data?.connections ?? []).filter(
    (connection) => connection.status === 'ready'
  );
  const syncedCoupons = (promotions.data?.data ?? []).filter(
    (promotion) => promotion.polar_discount_id
  );

  return (
    <div className="grid gap-4">
      <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <OperatorMetricCard
          icon={Zap}
          label={t('polarConnections')}
          tone={readyEnvironments.length > 0 ? 'success' : 'default'}
          value={`${readyEnvironments.length}/${integrations.length || 2}`}
        />
        <OperatorMetricCard
          icon={MonitorSmartphone}
          label={t('squareConnections')}
          tone={squareConnections.length > 0 ? 'success' : 'default'}
          value={`${squareConnections.length}/${squareSettings.data?.connections.length || 2}`}
        />
        <OperatorMetricCard
          icon={CreditCard}
          label={t('recentCheckouts')}
          value={paymentCheckouts.length}
        />
        <OperatorMetricCard
          icon={Package}
          label={t('productReady')}
          value={productsReady}
        />
      </div>

      <Tabs className="gap-3" defaultValue="connection">
        <TabsList className="grid h-auto w-full grid-cols-3">
          <TabsTrigger className="gap-2 py-1.5" value="connection">
            <Settings2 className="h-4 w-4" />
            {t('providersTab')}
          </TabsTrigger>
          <TabsTrigger className="gap-2 py-1.5" value="health">
            <Activity className="h-4 w-4" />
            {t('syncHealthTab')}
          </TabsTrigger>
          <TabsTrigger className="gap-2 py-1.5" value="activity">
            <CreditCard className="h-4 w-4" />
            {t('activityTab')}
          </TabsTrigger>
        </TabsList>

        {/* Connection + sync actions + product link status (per environment). */}
        <TabsContent value="connection">
          <PaymentSettingsPanel wsId={wsId} />
        </TabsContent>

        {/* Product catalog sync health (counts by status + recent errors). */}
        <TabsContent value="health">
          <PolarSyncHealthPanel wsId={wsId} />
        </TabsContent>

        <TabsContent className="grid gap-4" value="activity">
          <section className="grid min-w-0 gap-2 rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-primary/10 text-primary">
                <CreditCard className="h-3.5 w-3.5" />
              </span>
              <h3 className="font-semibold text-sm">
                {t('recentCheckoutsTitle')}
              </h3>
            </div>
            {paymentCheckouts.length === 0 ? (
              <EmptyRow label={t('recentCheckoutsEmpty')} />
            ) : (
              <div className="grid gap-2">
                {paymentCheckouts.map((row) => (
                  <div
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-background p-3 text-sm"
                    key={row.id}
                  >
                    <span className="min-w-0 truncate font-medium">
                      {row.customerName || row.publicToken}
                    </span>
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge
                        value={row.squareStatus ? t('square') : t('polar')}
                      />
                      {row.polarEnvironment ? (
                        <StatusBadge value={row.polarEnvironment} />
                      ) : null}
                      {row.polarStatus || row.squareStatus ? (
                        <StatusBadge
                          value={row.polarStatus ?? row.squareStatus ?? ''}
                        />
                      ) : null}
                      <span className="font-medium">
                        {money(row.totalAmount, row.currency)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="grid min-w-0 gap-2 rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-primary/10 text-primary">
                <TicketPercent className="h-3.5 w-3.5" />
              </span>
              <h3 className="font-semibold text-sm">
                {t('syncedCouponsTitle')}
              </h3>
            </div>
            <p className="text-muted-foreground text-xs leading-5">
              {t('syncedCouponsDescription')}
            </p>
            {syncedCoupons.length === 0 ? (
              <EmptyRow label={t('syncedCouponsEmpty')} />
            ) : (
              <div className="flex flex-wrap gap-2">
                {syncedCoupons.map((promotion) => (
                  <span
                    className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-2 py-1 text-sm"
                    key={promotion.id}
                  >
                    <TicketPercent className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="font-mono text-xs">{promotion.code}</span>
                  </span>
                ))}
              </div>
            )}
          </section>
        </TabsContent>
      </Tabs>
    </div>
  );
}
