'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, Copy, KeyRound, Webhook } from '@tuturuuu/icons';
import {
  getInventoryPolarSettings,
  type InventoryPolarEnvironment,
  updateInventoryPolarSettings,
} from '@tuturuuu/internal-api/inventory';
import { Button } from '@tuturuuu/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@tuturuuu/ui/collapsible';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import { SelectValueField } from './operator-form-fields';
import { CompactEditButton, ReadOnlyField } from './payment-read-only-fields';
import { PolarIntegrationStatusGrid } from './polar-integration-status-grid';
import { PolarTokenDialog } from './polar-token-dialog';

const environments: InventoryPolarEnvironment[] = ['sandbox', 'production'];

export function PolarSettingsPanel({ wsId }: { wsId: string }) {
  const t = useTranslations('inventory.operator.polar');
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState('');

  const [testingEnvironment, setTestingEnvironment] = useState<
    InventoryPolarEnvironment | ''
  >('');
  const [productionEnvironment, setProductionEnvironment] = useState<
    InventoryPolarEnvironment | ''
  >('');
  const settings = useQuery({
    queryFn: () => getInventoryPolarSettings(wsId),
    queryKey: ['inventory', wsId, 'polar-settings'],
  });

  // The inventory app proxies /api to the platform, so the current origin is the
  // correct public webhook host. Build the URL from the RESOLVED workspace UUID
  // (settings.wsId) — never the `personal` alias: Polar calls the webhook
  // server-to-server with no session, so an alias can't be resolved and every
  // delivery would fail signature lookup (Polar then disables the endpoint).
  const resolvedWsId = settings.data?.wsId ?? wsId;
  useEffect(() => {
    setWebhookUrl(
      `${window.location.origin}/api/v1/inventory/polar/webhook/${resolvedWsId}`
    );
  }, [resolvedWsId]);
  const copyWebhookUrl = async () => {
    if (!webhookUrl) return;
    try {
      await navigator.clipboard.writeText(webhookUrl);
      toast.success(t('webhookCopied'));
    } catch {
      toast.error(t('saveError'));
    }
  };
  const defaultsMutation = useMutation({
    mutationFn: () =>
      updateInventoryPolarSettings(wsId, {
        productionEnvironment:
          productionEnvironment || data?.productionEnvironment || 'production',
        testingEnvironment:
          testingEnvironment || data?.testingEnvironment || 'sandbox',
      }),
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t('saveError')),
    onSuccess: () => {
      setIsEditing(false);
      setTestingEnvironment('');
      setProductionEnvironment('');
      toast.success(t('saveSuccess'));
      queryClient.invalidateQueries({
        queryKey: ['inventory', wsId, 'polar-settings'],
      });
    },
  });
  const data = settings.data;
  const selectedTestingEnvironment =
    testingEnvironment || data?.testingEnvironment || 'sandbox';
  const selectedProductionEnvironment =
    productionEnvironment || data?.productionEnvironment || 'production';
  const environmentOptions = environments.map((environment) => ({
    label: t(`environment.${environment}`),
    value: environment,
  }));

  return (
    <section className="grid gap-4">
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="mt-1 inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-primary/10 text-primary">
              <KeyRound className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="font-semibold">{t('title')}</p>
              <p className="mt-1 text-muted-foreground text-sm">
                {t('description')}
              </p>
            </div>
          </div>
          <CompactEditButton
            editing={isEditing}
            label={isEditing ? t('cancelEditing') : t('editSettings')}
            onClick={() => {
              setIsEditing((current) => !current);
              setTestingEnvironment('');
              setProductionEnvironment('');
            }}
          />
        </div>

        {isEditing ? (
          <>
            <div className="mt-4 flex justify-end">
              <PolarTokenDialog wsId={wsId} />
            </div>
            <form
              className="mt-3 grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end"
              onSubmit={(event: FormEvent<HTMLFormElement>) => {
                event.preventDefault();
                defaultsMutation.mutate();
              }}
            >
              <SelectValueField
                allowEmpty={false}
                emptyText={t('emptyEnvironments')}
                label={t('testingDefault')}
                onChange={(value) =>
                  setTestingEnvironment(value as InventoryPolarEnvironment)
                }
                options={environmentOptions}
                placeholder={t('testingDefault')}
                searchPlaceholder={t('searchEnvironments')}
                value={selectedTestingEnvironment}
              />
              <SelectValueField
                allowEmpty={false}
                emptyText={t('emptyEnvironments')}
                label={t('productionDefault')}
                onChange={(value) =>
                  setProductionEnvironment(value as InventoryPolarEnvironment)
                }
                options={environmentOptions}
                placeholder={t('productionDefault')}
                searchPlaceholder={t('searchEnvironments')}
                value={selectedProductionEnvironment}
              />
              <Button disabled={defaultsMutation.isPending} type="submit">
                {defaultsMutation.isPending ? t('saving') : t('saveDefaults')}
              </Button>
            </form>
          </>
        ) : (
          <>
            <div className="mt-4 grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2">
              <ReadOnlyField
                label={t('testingDefault')}
                value={t(`environment.${selectedTestingEnvironment}`)}
              />
              <ReadOnlyField
                label={t('productionDefault')}
                value={t(`environment.${selectedProductionEnvironment}`)}
              />
            </div>
            <p className="mt-3 text-muted-foreground text-xs">
              {t('readOnlyHint')}
            </p>
          </>
        )}
      </div>

      <Collapsible className="rounded-lg border border-border bg-card">
        <CollapsibleTrigger className="group flex w-full min-w-0 items-start gap-3 p-4 text-left">
          <span className="mt-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-primary/10 text-primary">
            <Webhook className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{t('webhookTitle')}</p>
            <p className="mt-1 text-muted-foreground text-sm">
              {t('webhookDescription')}
            </p>
          </div>
          <ChevronDown className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent className="grid gap-2 px-4 pb-4">
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-xs">
              {webhookUrl || `…/api/v1/inventory/polar/webhook/${resolvedWsId}`}
            </code>
            <Button
              disabled={!webhookUrl}
              onClick={copyWebhookUrl}
              size="sm"
              type="button"
              variant="outline"
            >
              <Copy className="h-4 w-4" />
              {t('webhookCopy')}
            </Button>
          </div>
          <p className="text-muted-foreground text-xs">
            {t('webhookGuidance')}
          </p>
        </CollapsibleContent>
      </Collapsible>

      <PolarIntegrationStatusGrid integrations={data?.integrations ?? []} />
    </section>
  );
}
