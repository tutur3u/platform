import {
  Activity,
  BadgeDollarSign,
  Boxes,
  ClipboardList,
  CreditCard,
  Layers3,
  PackageSearch,
  ShieldCheck,
} from '@tuturuuu/icons';
import { getTranslations } from 'next-intl/server';
import { CheckoutFeeCalculator } from './checkout-fee-calculator';
import {
  InsightPanel,
  type MetricCard,
  MetricGrid,
  PageHeader,
  SplitPanel,
  type WorkCard,
  WorkList,
} from './inventory-cards';

export type InventoryView =
  | 'audits'
  | 'bundles'
  | 'checkout'
  | 'items'
  | 'overview'
  | 'stock'
  | 'stripe';

type InventoryWorkspacePageProps = {
  view: InventoryView;
};

function buildMetrics(
  t: Awaited<ReturnType<typeof getTranslations>>,
  view: InventoryView
): MetricCard[] {
  return [0, 1, 2].map((index) => ({
    label: t(`${view}.metrics.${index.toString()}.label`),
    value: t(`${view}.metrics.${index.toString()}.value`),
    detail: t(`${view}.metrics.${index.toString()}.detail`),
  }));
}

function buildCards(
  t: Awaited<ReturnType<typeof getTranslations>>,
  view: InventoryView
): WorkCard[] {
  return [0, 1, 2].map((index) => ({
    title: t(`${view}.cards.${index.toString()}.title`),
    detail: t(`${view}.cards.${index.toString()}.detail`),
    meta: t(`${view}.cards.${index.toString()}.meta`),
  }));
}

function getIcon(view: InventoryView) {
  switch (view) {
    case 'audits':
      return <ClipboardList className="h-5 w-5" />;
    case 'bundles':
      return <Layers3 className="h-5 w-5" />;
    case 'checkout':
      return <CreditCard className="h-5 w-5" />;
    case 'items':
      return <PackageSearch className="h-5 w-5" />;
    case 'stock':
      return <Boxes className="h-5 w-5" />;
    case 'stripe':
      return <BadgeDollarSign className="h-5 w-5" />;
    default:
      return <Activity className="h-5 w-5" />;
  }
}

export async function InventoryWorkspacePage({
  view,
}: InventoryWorkspacePageProps) {
  const t = await getTranslations('inventory.views');
  const metrics = buildMetrics(t, view);
  const cards = buildCards(t, view);
  const insights = [0, 1, 2].map((index) =>
    t(`${view}.insights.${index.toString()}`)
  );

  return (
    <div className="grid gap-4">
      <PageHeader
        description={t(`${view}.description`)}
        eyebrow={t(`${view}.eyebrow`)}
        title={t(`${view}.title`)}
      />
      <MetricGrid metrics={metrics} />
      {view === 'checkout' ? <CheckoutFeeCalculator /> : null}
      <SplitPanel
        secondary={
          <InsightPanel items={insights} title={t(`${view}.insightTitle`)} />
        }
      >
        <WorkList
          cards={cards}
          icon={getIcon(view)}
          title={t(`${view}.workTitle`)}
        />
      </SplitPanel>
      {view === 'stripe' ? (
        <section className="rounded-lg border border-dynamic-cyan/20 bg-dynamic-cyan/10 p-5 text-dynamic-cyan">
          <div className="flex items-center gap-2 font-semibold">
            <ShieldCheck className="h-5 w-5" />
            {t('stripe.connectTitle')}
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-6">
            {t('stripe.connectDescription')}
          </p>
        </section>
      ) : null}
    </div>
  );
}
