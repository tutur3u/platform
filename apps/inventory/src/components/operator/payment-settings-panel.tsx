'use client';

import { useQuery } from '@tanstack/react-query';
import { CreditCard, MonitorSmartphone } from '@tuturuuu/icons';
import {
  getInventoryPolarSettings,
  getInventorySquareSettings,
} from '@tuturuuu/internal-api/inventory';
import { Badge } from '@tuturuuu/ui/badge';
import { SettingsSection } from '@tuturuuu/ui/custom/settings-section';
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
      <Tabs className="min-w-0 gap-5" defaultValue={defaultProvider}>
        <SettingsSection title={t('title')} description={t('description')}>
          <TabsList className="grid h-auto w-full grid-cols-1 gap-2 bg-transparent p-2 sm:grid-cols-2">
            <TabsTrigger
              className="h-auto min-w-0 justify-start gap-3 rounded-lg border border-transparent px-3 py-3 text-left data-[state=active]:border-border data-[state=active]:bg-muted data-[state=active]:shadow-none"
              value="polar"
            >
              <CreditCard className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0">
                <span className="block font-medium">{t('polarTitle')}</span>
                <span className="block whitespace-normal font-normal text-muted-foreground text-sm">
                  {t('polarDescription')}
                </span>
              </span>
              <ProviderStatus checking={polar.isPending} ready={polarReady} />
            </TabsTrigger>
            <TabsTrigger
              className="h-auto min-w-0 justify-start gap-3 rounded-lg border border-transparent px-3 py-3 text-left data-[state=active]:border-border data-[state=active]:bg-muted data-[state=active]:shadow-none"
              value="square"
            >
              <MonitorSmartphone className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0">
                <span className="block font-medium">{t('squareTitle')}</span>
                <span className="block whitespace-normal font-normal text-muted-foreground text-sm">
                  {t('squareDescription')}
                </span>
              </span>
              <ProviderStatus checking={square.isPending} ready={squareReady} />
            </TabsTrigger>
          </TabsList>
        </SettingsSection>
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
