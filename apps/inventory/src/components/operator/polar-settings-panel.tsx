'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, ShieldCheck } from '@tuturuuu/icons';
import {
  getInventoryPolarSettings,
  type InventoryPolarEnvironment,
  updateInventoryPolarSettings,
} from '@tuturuuu/internal-api/inventory';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import type { FormEvent } from 'react';

const environments: InventoryPolarEnvironment[] = ['sandbox', 'production'];

export function PolarSettingsPanel({ wsId }: { wsId: string }) {
  const t = useTranslations('inventory.operator.polar');
  const queryClient = useQueryClient();
  const settings = useQuery({
    queryFn: () => getInventoryPolarSettings(wsId),
    queryKey: ['inventory', wsId, 'polar-settings'],
  });
  const mutation = useMutation({
    mutationFn: (formData: FormData) =>
      updateInventoryPolarSettings(wsId, {
        accessToken: String(formData.get('accessToken') ?? '') || undefined,
        environment: String(
          formData.get('environment') ?? 'sandbox'
        ) as InventoryPolarEnvironment,
        productionEnvironment: String(
          formData.get('productionEnvironment') ?? 'production'
        ) as InventoryPolarEnvironment,
        testingEnvironment: String(
          formData.get('testingEnvironment') ?? 'sandbox'
        ) as InventoryPolarEnvironment,
      }),
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t('saveError')),
    onSuccess: () => {
      toast.success(t('saveSuccess'));
      queryClient.invalidateQueries({
        queryKey: ['inventory', wsId, 'polar-settings'],
      });
    },
  });
  const data = settings.data;

  return (
    <section className="grid gap-4 p-4">
      <div className="rounded-lg border border-border bg-background p-4">
        <div className="flex items-start gap-3">
          <span className="mt-1 inline-flex h-9 w-9 items-center justify-center rounded-md border border-dynamic-blue/20 bg-dynamic-blue/10 text-dynamic-blue">
            <KeyRound className="h-4 w-4" />
          </span>
          <div>
            <p className="font-semibold">{t('title')}</p>
            <p className="mt-1 text-muted-foreground text-sm">
              {t('description')}
            </p>
          </div>
        </div>

        <form
          className="mt-4 grid gap-3 lg:grid-cols-[160px_1fr_auto]"
          onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            mutation.mutate(new FormData(event.currentTarget));
          }}
        >
          <select
            className="h-10 rounded-md border border-border bg-background px-3 text-sm"
            name="environment"
          >
            {environments.map((environment) => (
              <option key={environment} value={environment}>
                {t(`environment.${environment}`)}
              </option>
            ))}
          </select>
          <input
            className="h-10 rounded-md border border-border bg-background px-3 text-sm"
            name="accessToken"
            placeholder={t('tokenPlaceholder')}
            type="password"
          />
          <button
            className="inline-flex h-10 items-center justify-center rounded-md bg-dynamic-blue px-3 font-medium text-dynamic-blue-foreground text-sm disabled:opacity-50"
            disabled={mutation.isPending}
            type="submit"
          >
            {mutation.isPending ? t('saving') : t('saveToken')}
          </button>

          <label className="grid gap-1 text-sm">
            <span className="text-muted-foreground">{t('testingDefault')}</span>
            <select
              className="h-10 rounded-md border border-border bg-background px-3"
              defaultValue={data?.testingEnvironment ?? 'sandbox'}
              name="testingEnvironment"
            >
              {environments.map((environment) => (
                <option key={environment} value={environment}>
                  {t(`environment.${environment}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-muted-foreground">
              {t('productionDefault')}
            </span>
            <select
              className="h-10 rounded-md border border-border bg-background px-3"
              defaultValue={data?.productionEnvironment ?? 'production'}
              name="productionEnvironment"
            >
              {environments.map((environment) => (
                <option key={environment} value={environment}>
                  {t(`environment.${environment}`)}
                </option>
              ))}
            </select>
          </label>
        </form>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {environments.map((environment) => {
          const integration = data?.integrations.find(
            (item) => item.environment === environment
          );
          const ready = integration?.status === 'ready';

          return (
            <article
              className="rounded-lg border border-border bg-background p-4"
              key={environment}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium">
                    {t(`environment.${environment}`)}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {integration?.accessTokenLast4
                      ? t('tokenEnding', {
                          last4: integration.accessTokenLast4,
                        })
                      : t('notConfigured')}
                  </p>
                </div>
                <span className="inline-flex h-7 items-center gap-2 rounded-md border border-border px-2 text-xs">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  {ready ? t('ready') : (integration?.status ?? t('pending'))}
                </span>
              </div>
              <p className="mt-3 text-muted-foreground text-xs">
                {integration?.polarProductId
                  ? t('productReady', {
                      productId: integration.polarProductId,
                    })
                  : t('productMissing')}
              </p>
              {integration?.lastError ? (
                <p className="mt-3 rounded-md border border-dynamic-red/20 bg-dynamic-red/10 px-3 py-2 text-dynamic-red text-xs">
                  {integration.lastError}
                </p>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
