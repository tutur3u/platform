'use client';

import {
  ArrowRight,
  BarChart3,
  Boxes,
  Calculator,
  CheckCircle2,
  CircleDollarSign,
  Layers3,
  PackagePlus,
  PackageSearch,
  Store,
  TriangleAlert,
} from '@tuturuuu/icons';
import type {
  InventoryBundle,
  InventoryDashboardAction,
  InventoryDashboardRisk,
  InventoryDashboardSnapshot,
  InventoryPolarSettings,
  InventoryProductFormOptionsResponse,
  InventoryProductSummary,
  InventoryStorefront,
} from '@tuturuuu/internal-api/inventory';
import { Button } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { CostingProfileDialog } from './costing-profile-form';
import { BundleForm, StorefrontForm } from './inventory-forms';
import {
  OperatorActionRail,
  OperatorDataList,
  OperatorMetricCard,
  OperatorModuleCard,
} from './operator-dashboard-primitives';
import { currency } from './operator-format';
import { OverviewCharts } from './overview-charts';
import { OverviewReadiness } from './overview-readiness';
import { ProductCreateForm } from './product-management';

function numberFromRecord(
  row: Record<string, unknown>,
  keys: string[]
): number | null {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }

  return null;
}

function stringFromRecord(
  row: Record<string, unknown>,
  keys: string[]
): string | null {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === 'string' && value.trim()) return value;
  }

  return null;
}

function dashboardHref(wsId: string, view: string) {
  return `/${wsId}/${view}`;
}

function QuickActionButton({
  description,
  icon: Icon,
  label,
}: {
  description: string;
  icon: typeof Boxes;
  label: string;
}) {
  return (
    <Button
      className="h-auto w-full min-w-0 justify-start gap-3 px-3 py-2"
      type="button"
      variant="outline"
    >
      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate font-medium text-sm">{label}</span>
        <span className="block truncate text-muted-foreground text-xs">
          {description}
        </span>
      </span>
      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </Button>
  );
}

function ReadinessFallback({
  dashboard,
  products,
  readyPolarConnections,
  storefronts,
}: {
  dashboard?: InventoryDashboardSnapshot | null;
  products: InventoryProductSummary[];
  readyPolarConnections: number;
  storefronts: InventoryStorefront[];
}): InventoryDashboardSnapshot['readiness'] {
  if (dashboard?.readiness.length) return dashboard.readiness;

  return [
    {
      completed: products.length > 0 ? 1 : 0,
      key: 'products',
      score: products.length > 0 ? 100 : 0,
      total: 1,
      view: 'catalog',
    },
    {
      completed: storefronts.length > 0 ? 1 : 0,
      key: 'storefront',
      score: storefronts.length > 0 ? 100 : 0,
      total: 1,
      view: 'storefront',
    },
    {
      completed: readyPolarConnections > 0 ? 1 : 0,
      key: 'checkout',
      score: readyPolarConnections > 0 ? 100 : 0,
      total: 1,
      view: 'commerce',
    },
  ];
}

export function OverviewPanel({
  bundles,
  dashboard,
  formOptions,
  lowStock,
  polarSettings,
  products,
  storefronts,
  wsId,
}: {
  bundles: InventoryBundle[];
  dashboard?: InventoryDashboardSnapshot | null;
  formOptions?: InventoryProductFormOptionsResponse;
  lowStock: Array<Record<string, unknown>>;
  polarSettings?: InventoryPolarSettings;
  products: InventoryProductSummary[];
  storefronts: InventoryStorefront[];
  wsId: string;
}) {
  const t = useTranslations('inventory.operator.dashboard');
  const readyPolarConnections = (polarSettings?.integrations ?? []).filter(
    (integration) => integration.status === 'ready'
  ).length;
  const counts = dashboard?.counts;
  const revenue = dashboard?.analytics.revenueTrend.reduce(
    (total, point) => total + point.revenue,
    0
  );
  const quantity = dashboard?.analytics.revenueTrend.reduce(
    (total, point) => total + point.quantity,
    0
  );
  const readinessItems = ReadinessFallback({
    dashboard,
    products,
    readyPolarConnections,
    storefronts,
  });
  const readinessScore = readinessItems.length
    ? Math.round(
        readinessItems.reduce((total, item) => total + item.score, 0) /
          readinessItems.length
      )
    : 0;
  const fallbackRisks: InventoryDashboardRisk[] = lowStock
    .slice(0, 5)
    .map((row) => ({
      detail: null,
      entityId: stringFromRecord(row, ['id', 'product_id', 'productId']),
      kind: 'low_stock',
      label:
        stringFromRecord(row, ['name', 'product_name', 'productName']) ??
        t('unknownProduct'),
      metric: numberFromRecord(row, ['amount', 'quantity', 'available']),
      severity: 'high',
      view: 'stock',
    }));
  const risks = (dashboard?.risks.length ? dashboard.risks : fallbackRisks)
    .slice(0, 6)
    .map((risk, index) => ({ ...risk, key: `${risk.kind}-${index}` }));
  const fallbackRecommendedActions: InventoryDashboardAction[] = [];
  if (products.length === 0) {
    fallbackRecommendedActions.push({
      kind: 'create_product',
      priority: 1,
      view: 'catalog',
    });
  }
  if (storefronts.length === 0) {
    fallbackRecommendedActions.push({
      kind: 'publish_storefront',
      priority: 2,
      view: 'storefront',
    });
  }
  if (lowStock.length > 0) {
    fallbackRecommendedActions.push({
      kind: 'resolve_low_stock',
      priority: 3,
      view: 'stock',
    });
  }
  const recommendedActions: InventoryDashboardAction[] = dashboard?.actions
    .length
    ? dashboard.actions.slice(0, 5)
    : fallbackRecommendedActions;

  return (
    <div className="grid min-w-0 gap-4">
      <div className="grid min-w-0 gap-3 sm:grid-cols-2 2xl:grid-cols-6">
        <OperatorMetricCard
          description={t('kpis.productsDescription', {
            count: counts?.stockRows ?? products.length,
          })}
          icon={PackageSearch}
          label={t('kpis.products')}
          value={counts?.products ?? products.length}
        />
        <OperatorMetricCard
          description={t('kpis.lowStockDescription')}
          icon={TriangleAlert}
          label={t('kpis.lowStock')}
          tone={
            (counts?.lowStock ?? lowStock.length) > 0 ? 'danger' : 'success'
          }
          value={counts?.lowStock ?? lowStock.length}
        />
        <OperatorMetricCard
          description={t('kpis.storefrontsDescription', {
            count:
              counts?.publishedStorefronts ??
              storefronts.filter(
                (storefront) => storefront.status === 'published'
              ).length,
          })}
          icon={Store}
          label={t('kpis.storefronts')}
          value={counts?.storefronts ?? storefronts.length}
        />
        <OperatorMetricCard
          description={t('kpis.bundlesDescription', {
            count:
              counts?.activeBundles ??
              bundles.filter((bundle) => bundle.status === 'active').length,
          })}
          icon={Layers3}
          label={t('kpis.bundles')}
          value={counts?.bundles ?? bundles.length}
        />
        <OperatorMetricCard
          description={t('itemsSold', { count: quantity ?? 0 })}
          icon={CircleDollarSign}
          label={t('kpis.revenue')}
          value={currency(revenue ?? 0)}
        />
        <OperatorMetricCard
          description={t('kpis.readinessDescription')}
          icon={CheckCircle2}
          label={t('kpis.readiness')}
          tone={readinessScore >= 80 ? 'success' : 'warning'}
          value={`${readinessScore}%`}
        />
      </div>

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(20rem,0.65fr)]">
        <OperatorModuleCard
          description={t('readiness.description')}
          icon={CheckCircle2}
          title={t('readiness.title')}
        >
          <OverviewReadiness items={readinessItems} wsId={wsId} />
        </OperatorModuleCard>
        <OperatorModuleCard
          description={t('quickActionsDescription')}
          icon={PackagePlus}
          title={t('quickActions')}
        >
          <div className="grid min-w-0 gap-2">
            <ProductCreateForm
              options={formOptions}
              trigger={
                <QuickActionButton
                  description={t('quick.productDescription')}
                  icon={PackagePlus}
                  label={t('quick.product')}
                />
              }
              wsId={wsId}
            />
            <CostingProfileDialog
              options={formOptions}
              trigger={
                <QuickActionButton
                  description={t('quick.costingDescription')}
                  icon={Calculator}
                  label={t('quick.costing')}
                />
              }
              wsId={wsId}
            />
            <StorefrontForm
              trigger={
                <QuickActionButton
                  description={t('quick.storefrontDescription')}
                  icon={Store}
                  label={t('quick.storefront')}
                />
              }
              wsId={wsId}
            />
            <BundleForm
              products={products}
              trigger={
                <QuickActionButton
                  description={t('quick.bundleDescription')}
                  icon={Layers3}
                  label={t('quick.bundle')}
                />
              }
              wsId={wsId}
            />
          </div>
        </OperatorModuleCard>
      </div>

      <OverviewCharts dashboard={dashboard} />

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(20rem,0.9fr)]">
        <OperatorModuleCard
          description={t('attentionDescription')}
          icon={TriangleAlert}
          title={t('attention')}
        >
          <OperatorDataList
            empty={
              <div className="rounded-lg border border-border bg-muted/20 p-3 text-sm">
                <div className="flex min-w-0 items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
                  <p className="font-medium">{t('noRisks')}</p>
                </div>
                <p className="mt-1 text-muted-foreground text-sm">
                  {t('noRisksDescription')}
                </p>
              </div>
            }
            isEmpty={risks.length === 0}
            loadingLabel={t('loading')}
          >
            {risks.length === 0
              ? null
              : risks.map((risk) => (
                  <Link
                    className="grid min-w-0 gap-2 rounded-lg border border-border bg-background p-3 transition hover:border-primary/40 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
                    href={dashboardHref(wsId, risk.view)}
                    key={risk.key}
                  >
                    <span className="min-w-0">
                      <span className="flex min-w-0 flex-wrap items-center gap-2">
                        <span
                          className={cn(
                            'inline-flex h-6 items-center rounded-md border px-2 font-medium text-xs',
                            risk.severity === 'high' &&
                              'border-destructive/30 bg-destructive/10 text-destructive',
                            risk.severity === 'medium' &&
                              'border-border bg-accent text-accent-foreground',
                            risk.severity === 'low' &&
                              'border-border bg-muted text-muted-foreground'
                          )}
                        >
                          {t(`risk.${risk.kind}`)}
                        </span>
                        <span className="truncate font-medium text-sm">
                          {risk.label}
                        </span>
                      </span>
                      <span className="mt-1 block truncate text-muted-foreground text-xs">
                        {t(`severity.${risk.severity}`)}
                        {typeof risk.metric === 'number'
                          ? ` - ${t('riskMetric', { count: risk.metric })}`
                          : ''}
                      </span>
                    </span>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </Link>
                ))}
          </OperatorDataList>
        </OperatorModuleCard>

        <OperatorModuleCard
          description={t('recommendationsDescription')}
          icon={BarChart3}
          title={t('recommendations')}
        >
          {recommendedActions.length ? (
            <OperatorActionRail
              actions={recommendedActions.map((action) => ({
                description: t(`actions.${action.kind}.description`),
                href: dashboardHref(wsId, action.view),
                icon:
                  action.kind === 'create_costing'
                    ? Calculator
                    : action.kind === 'create_product'
                      ? PackagePlus
                      : action.kind === 'publish_storefront'
                        ? Store
                        : action.kind === 'resolve_low_stock'
                          ? TriangleAlert
                          : Boxes,
                label: t(`actions.${action.kind}.label`),
              }))}
            />
          ) : (
            <div className="rounded-lg border border-border bg-muted/20 p-3 text-sm">
              <div className="flex min-w-0 items-center gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
                <p className="font-medium">{t('noRecommendations')}</p>
              </div>
              <p className="mt-1 text-muted-foreground">
                {t('noRecommendationsDescription')}
              </p>
            </div>
          )}
        </OperatorModuleCard>
      </div>

      <div className="grid min-w-0 gap-4 xl:grid-cols-2">
        <OperatorModuleCard
          description={t('costingDescription')}
          icon={Calculator}
          title={t('costing')}
        >
          <div className="grid min-w-0 gap-3 sm:grid-cols-3">
            <SummaryPill
              label={t('summary.profiles')}
              value={dashboard?.costing.profilesCount ?? 0}
            />
            <SummaryPill
              label={t('summary.averageMargin')}
              value={`${dashboard?.costing.averageMarginPercentage ?? 0}%`}
            />
            <SummaryPill
              label={t('summary.lowestBreakEven')}
              value={dashboard?.costing.lowestBreakEvenQuantity ?? '-'}
            />
          </div>
        </OperatorModuleCard>
        <OperatorModuleCard
          description={t('storefrontHealthDescription')}
          icon={Store}
          title={t('storefrontHealth')}
        >
          <div className="grid min-w-0 gap-3 sm:grid-cols-3">
            <SummaryPill
              label={t('summary.publishedListings')}
              value={dashboard?.counts.publishedListings ?? 0}
            />
            <SummaryPill
              label={t('summary.simulatedCheckout')}
              value={dashboard?.storefrontHealth.simulatedCheckout ?? 0}
            />
            <SummaryPill
              label={t('summary.polarCheckout')}
              value={dashboard?.storefrontHealth.polarCheckout ?? 0}
            />
          </div>
        </OperatorModuleCard>
      </div>
    </div>
  );
}

function SummaryPill({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-background p-3">
      <p className="truncate text-muted-foreground text-xs">{label}</p>
      <p className="mt-1 truncate font-semibold text-xl">{value}</p>
    </div>
  );
}
