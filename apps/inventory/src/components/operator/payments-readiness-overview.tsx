import {
  ArrowRight,
  CheckCircle2,
  CreditCard,
  MonitorSmartphone,
  ShieldCheck,
} from '@tuturuuu/icons';
import type {
  InventoryCheckoutSession,
  InventoryPolarSettings,
  InventorySquareCatalogSyncState,
  InventorySquareSettings,
} from '@tuturuuu/internal-api/inventory';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Progress } from '@tuturuuu/ui/progress';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import {
  getPaymentReadinessScore,
  getPaymentsNextStep,
} from './payments-readiness';

function ProviderLine({
  description,
  icon: Icon,
  ready,
  title,
}: {
  description: string;
  icon: typeof CreditCard;
  ready: boolean;
  title: string;
}) {
  const t = useTranslations('inventory.operator.paymentsHub');
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border/70 bg-background/70 p-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-border bg-card">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-sm">{title}</p>
        <p className="truncate text-muted-foreground text-xs">{description}</p>
      </div>
      <Badge
        className={cn(
          ready
            ? 'border-dynamic-green/35 bg-dynamic-green/10 text-dynamic-green'
            : 'border-dynamic-orange/35 bg-dynamic-orange/10 text-dynamic-orange'
        )}
        variant="outline"
      >
        {ready ? t('ready') : t('actionNeeded')}
      </Badge>
    </div>
  );
}

export function PaymentsReadinessOverview({
  checkouts,
  onOpenSection,
  polarSettings,
  squareSettings,
  squareSync,
}: {
  checkouts: InventoryCheckoutSession[];
  onOpenSection: (section: 'setup' | 'sync' | 'transactions') => void;
  polarSettings?: InventoryPolarSettings;
  squareSettings?: InventorySquareSettings;
  squareSync?: InventorySquareCatalogSyncState | null;
}) {
  const t = useTranslations('inventory.operator.paymentsHub');
  const readiness = getPaymentReadinessScore({
    polarSettings,
    squareSettings,
    squareSync,
  });
  const nextStep = getPaymentsNextStep({
    checkouts,
    squareSettings,
    squareSync,
  });
  const polarReady = (polarSettings?.integrations ?? []).some(
    (integration) => integration.status === 'ready'
  );
  const squareReady = (squareSettings?.connections ?? []).some(
    (connection) => connection.status === 'ready'
  );
  const targetSection =
    nextStep === 'importCatalog'
      ? 'sync'
      : nextStep === 'runTerminalTest' || nextStep === 'monitor'
        ? 'transactions'
        : 'setup';

  return (
    <section className="relative overflow-hidden rounded-2xl border border-border bg-card">
      <div
        aria-hidden
        className="absolute inset-0 bg-[radial-gradient(circle_at_85%_15%,var(--muted),transparent_38%)]"
      />
      <div className="relative grid gap-6 p-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(19rem,0.65fr)] lg:p-7">
        <div className="max-w-3xl">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{t('eyebrow')}</Badge>
            <Badge className="gap-1" variant="secondary">
              <ShieldCheck className="size-3.5" />
              {t('guarded')}
            </Badge>
          </div>
          <h2 className="mt-4 max-w-2xl text-balance font-semibold text-2xl tracking-tight sm:text-3xl">
            {t('title')}
          </h2>
          <p className="mt-3 max-w-2xl text-muted-foreground text-sm leading-6">
            {t('description')}
          </p>

          <div className="mt-6 rounded-xl border border-border/70 bg-background/70 p-4">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
                <ArrowRight className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-sm">{t('nextStep')}</p>
                <p className="mt-1 text-muted-foreground text-sm leading-6">
                  {t(`nextSteps.${nextStep}`)}
                </p>
              </div>
              <Button
                className="shrink-0"
                onClick={() => onOpenSection(targetSection)}
                size="sm"
                type="button"
              >
                {t('continue')}
                <ArrowRight className="size-4" />
              </Button>
            </div>
          </div>
        </div>

        <aside className="grid content-start gap-3 rounded-xl border border-border/70 bg-muted/20 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-medium text-sm">{t('readinessTitle')}</p>
              <p className="text-muted-foreground text-xs">
                {t('readinessCount', readiness)}
              </p>
            </div>
            <span className="font-semibold text-xl tabular-nums">
              {readiness.percent}%
            </span>
          </div>
          <Progress
            aria-label={t('readinessTitle')}
            value={readiness.percent}
          />
          <div className="mt-1 grid gap-2">
            <ProviderLine
              description={t('polarDescription')}
              icon={CreditCard}
              ready={polarReady}
              title={t('polar')}
            />
            <ProviderLine
              description={t('squareDescription')}
              icon={MonitorSmartphone}
              ready={squareReady}
              title={t('square')}
            />
          </div>
          <div className="flex items-start gap-2 rounded-lg border border-dynamic-green/25 bg-dynamic-green/5 p-3 text-xs leading-5">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-dynamic-green" />
            <span>{t('safetyPromise')}</span>
          </div>
        </aside>
      </div>
    </section>
  );
}
