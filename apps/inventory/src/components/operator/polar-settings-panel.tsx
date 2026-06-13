'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Settings2, ShieldCheck } from '@tuturuuu/icons';
import {
  getInventoryPolarSettings,
  type InventoryPolarEnvironment,
  updateInventoryPolarSettings,
} from '@tuturuuu/internal-api/inventory';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
import { Input } from '@tuturuuu/ui/input';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import type { FormEvent } from 'react';
import { useState } from 'react';
import { SelectValueField } from './operator-form-fields';

const environments: InventoryPolarEnvironment[] = ['sandbox', 'production'];

export function PolarSettingsPanel({ wsId }: { wsId: string }) {
  const t = useTranslations('inventory.operator.polar');
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [accessToken, setAccessToken] = useState('');
  const [tokenEnvironment, setTokenEnvironment] =
    useState<InventoryPolarEnvironment>('sandbox');
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
  const tokenMutation = useMutation({
    mutationFn: () =>
      updateInventoryPolarSettings(wsId, {
        accessToken: accessToken || undefined,
        environment: tokenEnvironment,
      }),
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t('saveError')),
    onSuccess: () => {
      setOpen(false);
      setAccessToken('');
      toast.success(t('saveSuccess'));
      queryClient.invalidateQueries({
        queryKey: ['inventory', wsId, 'polar-settings'],
      });
    },
  });
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
          <Dialog onOpenChange={setOpen} open={open}>
            <DialogTrigger asChild>
              <Button type="button" variant="outline">
                <Settings2 className="h-4 w-4" />
                {t('manage')}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[calc(100dvh-2rem)] w-[min(calc(100vw-2rem),32rem)] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{t('dialogTitle')}</DialogTitle>
                <DialogDescription>{t('dialogDescription')}</DialogDescription>
              </DialogHeader>
              <form
                className="grid gap-3"
                onSubmit={(event: FormEvent<HTMLFormElement>) => {
                  event.preventDefault();
                  tokenMutation.mutate();
                }}
              >
                <SelectValueField
                  allowEmpty={false}
                  emptyText={t('emptyEnvironments')}
                  label={t('environmentLabel')}
                  onChange={(value) =>
                    setTokenEnvironment(value as InventoryPolarEnvironment)
                  }
                  options={environmentOptions}
                  placeholder={t('environmentLabel')}
                  searchPlaceholder={t('searchEnvironments')}
                  value={tokenEnvironment}
                />
                <label className="grid min-w-0 gap-1 text-sm">
                  <span className="font-medium">{t('tokenLabel')}</span>
                  <Input
                    className="h-10"
                    onChange={(event) => setAccessToken(event.target.value)}
                    placeholder={t('tokenPlaceholder')}
                    type="password"
                    value={accessToken}
                  />
                </label>
                <DialogFooter>
                  <Button disabled={tokenMutation.isPending} type="submit">
                    {tokenMutation.isPending ? t('saving') : t('saveToken')}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <form
          className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end"
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
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {environments.map((environment) => {
          const integration = (data?.integrations ?? []).find(
            (item) => item.environment === environment
          );
          const ready = integration?.status === 'ready';

          return (
            <article
              className="rounded-lg border border-border bg-card p-4"
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
                <p className="mt-3 rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-destructive text-xs">
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
