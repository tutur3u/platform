'use client';

import { useQuery } from '@tanstack/react-query';
import { CreditCard, Package, TicketPercent, Zap } from '@tuturuuu/icons';
import {
  getInventoryPolarSettings,
  listInventoryCheckouts,
  listInventoryPromotions,
} from '@tuturuuu/internal-api/inventory';
import { useTranslations } from 'next-intl';
import { OperatorMetricCard } from './operator-dashboard-primitives';
import { currency } from './operator-format';
import { EmptyRow } from './operator-shell';
import { PolarSettingsPanel } from './polar-settings-panel';

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
  const polarCheckouts = (checkouts.data?.data ?? []).filter(
    (row) => row.polarStatus
  );
  const syncedCoupons = (promotions.data?.data ?? []).filter(
    (promotion) => promotion.polar_discount_id
  );

  return (
    <div className="grid gap-4">
      <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <OperatorMetricCard
          icon={Zap}
          label={t('connectedEnvironments')}
          tone={readyEnvironments.length > 0 ? 'success' : 'default'}
          value={`${readyEnvironments.length}/${integrations.length || 2}`}
        />
        <OperatorMetricCard
          icon={Package}
          label={t('productReady')}
          value={productsReady}
        />
        <OperatorMetricCard
          icon={CreditCard}
          label={t('recentCheckouts')}
          value={polarCheckouts.length}
        />
        <OperatorMetricCard
          icon={TicketPercent}
          label={t('syncedCoupons')}
          value={syncedCoupons.length}
        />
      </div>

      {/* Connection + sync actions + product link status (per environment). */}
      <PolarSettingsPanel wsId={wsId} />

      <section className="grid min-w-0 gap-2 rounded-lg border border-border bg-card p-4">
        <h3 className="font-semibold text-sm">{t('recentCheckoutsTitle')}</h3>
        {polarCheckouts.length === 0 ? (
          <EmptyRow label={t('recentCheckoutsEmpty')} />
        ) : (
          <div className="grid gap-2">
            {polarCheckouts.map((row) => (
              <div
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-background p-3 text-sm"
                key={row.id}
              >
                <span className="min-w-0 truncate font-medium">
                  {row.customerName || row.publicToken}
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  {row.polarEnvironment ? (
                    <StatusBadge value={row.polarEnvironment} />
                  ) : null}
                  {row.polarStatus ? (
                    <StatusBadge value={row.polarStatus} />
                  ) : null}
                  <span className="font-medium">
                    {currency(row.totalAmount, row.currency)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="grid min-w-0 gap-2 rounded-lg border border-border bg-card p-4">
        <h3 className="font-semibold text-sm">{t('syncedCouponsTitle')}</h3>
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
    </div>
  );
}
