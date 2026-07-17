'use client';

import {
  CheckCircle2,
  ExternalLink,
  Settings2,
  ShieldCheck,
} from '@tuturuuu/icons';
import type {
  InventorySquareEnvironment,
  InventorySquareSettings,
} from '@tuturuuu/internal-api/inventory';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@tuturuuu/ui/accordion';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { useTranslations } from 'next-intl';
import { SquareFirstPaymentDialog } from './square-production-launch-dialog';
import { SquareProductionLaunchGuide } from './square-production-launch-guide';
import {
  getSquareSetupProgress,
  type SquareSetupStepId,
} from './square-setup-progress';

const SQUARE_DOCS = {
  application: 'https://developer.squareup.com/apps',
  connection: 'https://developer.squareup.com/docs/oauth-api/overview',
  device: 'https://developer.squareup.com/docs/terminal-api/pos-integration',
  location: 'https://developer.squareup.com/docs/locations-api',
  webhook: 'https://developer.squareup.com/docs/webhooks/overview',
} as const;

export function SquareProductionSetupGuide({
  environment,
  onConfigureStep,
  onEnvironmentChange,
  settings,
  webhookUrl,
}: {
  environment: InventorySquareEnvironment;
  onConfigureStep: (step: SquareSetupStepId) => void;
  onEnvironmentChange: (environment: InventorySquareEnvironment) => void;
  settings?: InventorySquareSettings;
  webhookUrl: string;
}) {
  const t = useTranslations('inventory.operator.square.guide');
  const appCredential = settings?.appCredentials.find(
    (item) => item.environment === environment
  );
  const connection = settings?.connections.find(
    (item) => item.environment === environment
  );
  const savedDefaultsMatchEnvironment = settings?.environment === environment;
  const progress = getSquareSetupProgress({
    appCredential,
    connection,
    deviceId: savedDefaultsMatchEnvironment
      ? (settings?.deviceId ?? null)
      : null,
    environment,
    locationId: savedDefaultsMatchEnvironment
      ? (settings?.locationId ?? null)
      : null,
    sandboxDeviceId: savedDefaultsMatchEnvironment
      ? (settings?.sandboxDeviceId ?? null)
      : null,
  });
  const defaultStep = progress.firstIncompleteId ?? 'device';
  const connectionReady = progress.steps
    .filter((step) => step.id !== 'device')
    .every((step) => step.complete);
  const deviceReady =
    progress.steps.find((step) => step.id === 'device')?.complete ?? false;

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="grid gap-5 border-border border-b p-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
        <div className="max-w-2xl">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{t('eyebrow')}</Badge>
            <Badge variant={progress.ready ? 'default' : 'secondary'}>
              {progress.ready ? t('ready') : t('inProgress')}
            </Badge>
          </div>
          <h3 className="mt-3 text-balance font-semibold text-xl tracking-tight">
            {t('title')}
          </h3>
          <p className="mt-2 text-muted-foreground text-sm leading-6">
            {t(`${environment}.description`)}
          </p>
        </div>
        <div className="grid gap-3 lg:justify-items-end">
          <Tabs
            onValueChange={(value) =>
              onEnvironmentChange(value as InventorySquareEnvironment)
            }
            value={environment}
          >
            <TabsList className="grid w-full grid-cols-2 lg:w-64">
              <TabsTrigger value="production">
                {t('production.tab')}
              </TabsTrigger>
              <TabsTrigger value="sandbox">{t('sandbox.tab')}</TabsTrigger>
            </TabsList>
          </Tabs>
          <p className="font-mono text-muted-foreground text-xs">
            {t('progress', {
              completed: progress.completed,
              total: progress.total,
            })}
          </p>
        </div>
      </div>

      <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_17rem]">
        <Accordion
          className="border-border border-t"
          collapsible
          defaultValue={defaultStep}
          type="single"
        >
          {progress.steps.map((step, index) => (
            <AccordionItem key={step.id} value={step.id}>
              <AccordionTrigger className="gap-3 py-4 hover:no-underline">
                <span className="flex min-w-0 items-start gap-3">
                  <span className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-md border border-border bg-muted/40 font-mono text-xs">
                    {step.complete ? (
                      <CheckCircle2 className="size-4 text-primary" />
                    ) : (
                      index + 1
                    )}
                  </span>
                  <span className="grid min-w-0 gap-1">
                    <span>{t(`steps.${step.id}.title`)}</span>
                    <span className="font-normal text-muted-foreground text-xs">
                      {step.complete ? t('complete') : t('needsAction')}
                    </span>
                  </span>
                </span>
              </AccordionTrigger>
              <AccordionContent className="pl-9">
                <p className="max-w-2xl text-muted-foreground leading-6">
                  {t(`steps.${step.id}.${environment}`)}
                </p>
                {step.id === 'webhook' && webhookUrl ? (
                  <code className="mt-3 block overflow-x-auto rounded-md border border-border bg-muted/30 px-3 py-2 font-mono text-xs">
                    {webhookUrl}
                  </code>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  {!step.complete ? (
                    <Button
                      onClick={() => onConfigureStep(step.id)}
                      size="sm"
                      type="button"
                    >
                      <Settings2 className="size-3.5" />
                      {t('configureStep')}
                    </Button>
                  ) : null}
                  <Button asChild size="sm" variant="outline">
                    <a
                      href={SQUARE_DOCS[step.id]}
                      rel="noreferrer"
                      target="_blank"
                    >
                      {t('openSquareGuide')}
                      <ExternalLink className="size-3.5" />
                    </a>
                  </Button>
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>

        <aside className="h-fit rounded-lg border border-border bg-muted/20 p-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-primary" />
            <p className="font-semibold text-sm">{t('safety.title')}</p>
          </div>
          <p className="mt-2 text-muted-foreground text-sm leading-6">
            {t(`${environment}.safety`)}
          </p>
          <div className="mt-4">
            <SquareFirstPaymentDialog fullWidth />
          </div>
        </aside>
      </div>
      {environment === 'production' ? (
        <SquareProductionLaunchGuide
          connectionReady={connectionReady}
          deviceReady={deviceReady}
        />
      ) : null}
    </section>
  );
}
