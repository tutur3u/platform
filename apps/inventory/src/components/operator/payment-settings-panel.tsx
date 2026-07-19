'use client';

import { useQuery } from '@tanstack/react-query';
import { CreditCard, MonitorSmartphone, ShieldCheck } from '@tuturuuu/icons';
import {
  getInventoryPolarSettings,
  getInventorySquareSettings,
} from '@tuturuuu/internal-api/inventory';
import { Badge } from '@tuturuuu/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { PolarSettingsPanel } from './polar-settings-panel';
import { SquareSettingsPanel } from './square-settings-panel';

type PaymentProvider = 'polar' | 'square';

function ProviderStatus({
  checking,
  ready,
}: {
  checking: boolean;
  ready: boolean;
}) {
  const t = useTranslations('inventory.operator.payments');

  return (
    <Badge
      className={cn(
        'ml-auto shrink-0 font-semibold',
        checking && 'border-border bg-muted/60 text-foreground',
        !checking &&
          ready &&
          'border-dynamic-green/40 bg-dynamic-green/15 text-dynamic-green',
        !checking &&
          !ready &&
          'border-dynamic-orange/40 bg-dynamic-orange/15 text-dynamic-orange'
      )}
      variant="outline"
    >
      {checking ? t('checking') : ready ? t('ready') : t('setupRequired')}
    </Badge>
  );
}

export function PaymentSettingsPanel({
  defaultProvider = 'polar',
  wsId,
}: {
  defaultProvider?: PaymentProvider;
  wsId: string;
}) {
  const t = useTranslations('inventory.operator.payments');
  const polar = useQuery({
    queryFn: () => getInventoryPolarSettings(wsId),
    queryKey: ['inventory', wsId, 'polar-settings'],
  });
  const square = useQuery({
    queryFn: () => getInventorySquareSettings(wsId),
    queryKey: ['inventory', wsId, 'square-settings'],
  });
  const polarReady = (polar.data?.integrations ?? []).some(
    (integration) => integration.status === 'ready'
  );
  const squareReady =
    square.data?.readiness.ready || square.data?.posReadiness.ready || false;

  return (
    <section className="grid min-w-0 gap-5">
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-5 sm:p-6">
        <div
          aria-hidden
          className="absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_80%_20%,var(--muted),transparent_70%)]"
        />
        <div className="relative flex max-w-2xl items-start gap-4">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-border bg-background shadow-sm">
            <ShieldCheck className="size-5" />
          </span>
          <div>
            <p className="font-mono text-muted-foreground text-xs uppercase tracking-[0.18em]">
              {t('eyebrow')}
            </p>
            <h2 className="mt-2 font-semibold text-xl tracking-tight">
              {t('title')}
            </h2>
            <p className="mt-1.5 text-muted-foreground text-sm leading-6">
              {t('description')}
            </p>
          </div>
        </div>
      </div>

      <Tabs className="min-w-0 gap-4" defaultValue={defaultProvider}>
        <TabsList className="grid h-auto w-full grid-cols-1 gap-2 bg-muted/35 p-2 sm:grid-cols-2">
          <TabsTrigger
            className="h-auto min-w-0 justify-start gap-3 rounded-xl border border-transparent px-4 py-3 text-left data-[state=active]:border-border data-[state=active]:bg-background data-[state=active]:shadow-sm"
            value="polar"
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-border bg-card">
              <CreditCard className="size-4" />
            </span>
            <span className="min-w-0">
              <span className="block font-medium">{t('polarTitle')}</span>
              <span className="block truncate font-normal text-muted-foreground text-xs">
                {t('polarDescription')}
              </span>
            </span>
            <ProviderStatus checking={polar.isPending} ready={polarReady} />
          </TabsTrigger>
          <TabsTrigger
            className="h-auto min-w-0 justify-start gap-3 rounded-xl border border-transparent px-4 py-3 text-left data-[state=active]:border-border data-[state=active]:bg-background data-[state=active]:shadow-sm"
            value="square"
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-border bg-card">
              <MonitorSmartphone className="size-4" />
            </span>
            <span className="min-w-0">
              <span className="block font-medium">{t('squareTitle')}</span>
              <span className="block truncate font-normal text-muted-foreground text-xs">
                {t('squareDescription')}
              </span>
            </span>
            <ProviderStatus checking={square.isPending} ready={squareReady} />
          </TabsTrigger>
        </TabsList>
        <TabsContent value="polar">
          <PolarSettingsPanel wsId={wsId} />
        </TabsContent>
        <TabsContent value="square">
          <SquareSettingsPanel wsId={wsId} />
        </TabsContent>
      </Tabs>
    </section>
  );
}
