'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Boxes,
  Calculator,
  CheckCircle2,
  CircleDollarSign,
  Compass,
  Store,
} from '@tuturuuu/icons';
import {
  getUserWorkspaceConfig,
  updateUserWorkspaceConfig,
} from '@tuturuuu/internal-api/users';
import { Button } from '@tuturuuu/ui/button';
import { Dialog, DialogClose } from '@tuturuuu/ui/dialog';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import {
  OperatorDialogBody,
  OperatorDialogContent,
  OperatorDialogFooter,
  OperatorDialogHeader,
} from './operator-dialog-shell';
import type { InventoryOperatorView } from './operator-types';

const GUIDE_CONFIG_ID = 'inventory.launch_walkthrough';

export function InventoryGuidance({
  costingProfilesCount,
  productsCount,
  storefrontsCount,
  view,
  wsId,
}: {
  costingProfilesCount: number;
  productsCount: number;
  storefrontsCount: number;
  view: InventoryOperatorView;
  wsId: string;
}) {
  const t = useTranslations('inventory.operator.guidance');
  const formsText = useTranslations('inventory.operator.forms');
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const isEmptyWorkspace =
    productsCount === 0 && storefrontsCount === 0 && costingProfilesCount === 0;
  const config = useQuery({
    enabled: view === 'overview',
    queryFn: () => getUserWorkspaceConfig(wsId, GUIDE_CONFIG_ID),
    queryKey: ['inventory', wsId, 'guidance', GUIDE_CONFIG_ID],
  });
  const completed = Boolean(config.data?.value);
  const steps = useMemo(
    () => [
      {
        done: productsCount > 0,
        icon: Boxes,
        key: 'setup',
      },
      {
        done: costingProfilesCount > 0,
        icon: Calculator,
        key: 'costing',
      },
      {
        done: storefrontsCount > 0,
        icon: Store,
        key: 'storefront',
      },
      {
        done: storefrontsCount > 0,
        icon: CircleDollarSign,
        key: 'checkout',
      },
    ],
    [costingProfilesCount, productsCount, storefrontsCount]
  );
  const dismissMutation = useMutation({
    mutationFn: () =>
      updateUserWorkspaceConfig(
        wsId,
        GUIDE_CONFIG_ID,
        new Date().toISOString()
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['inventory', wsId, 'guidance', GUIDE_CONFIG_ID],
      });
      setOpen(false);
    },
  });

  useEffect(() => {
    if (isEmptyWorkspace && config.isSuccess && !completed) {
      setOpen(true);
    }
  }, [completed, config.isSuccess, isEmptyWorkspace]);

  if (view !== 'overview') return null;

  return (
    <section className="grid gap-3 rounded-lg border border-border bg-card p-4 md:grid-cols-[1fr_auto] md:items-center">
      <div className="flex min-w-0 items-start gap-3">
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Compass className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h2 className="font-semibold">{t('bannerTitle')}</h2>
          <p className="mt-1 text-muted-foreground text-sm leading-6">
            {t('bannerDescription')}
          </p>
        </div>
      </div>
      <Button onClick={() => setOpen(true)} type="button" variant="outline">
        <Compass className="h-4 w-4" />
        {completed ? t('replay') : t('start')}
      </Button>
      <Dialog onOpenChange={setOpen} open={open}>
        <OperatorDialogContent size="md">
          <OperatorDialogHeader
            description={t('description')}
            title={t('title')}
          />
          <OperatorDialogBody className="grid gap-3">
            {steps.map((step) => {
              const Icon = step.icon;

              return (
                <div
                  className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-[auto_1fr_auto] sm:items-start"
                  key={step.key}
                >
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <Icon className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="font-medium">
                      {t(`steps.${step.key}.title`)}
                    </p>
                    <p className="mt-1 text-muted-foreground text-sm leading-6">
                      {t(`steps.${step.key}.description`)}
                    </p>
                  </div>
                  {step.done ? (
                    <CheckCircle2 className="h-5 w-5 text-primary" />
                  ) : null}
                </div>
              );
            })}
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <p className="font-medium text-sm">{t('tipTitle')}</p>
              <p className="mt-1 text-muted-foreground text-sm leading-6">
                {t('tipDescription')}
              </p>
            </div>
          </OperatorDialogBody>
          <OperatorDialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                {formsText('cancel')}
              </Button>
            </DialogClose>
            <Button
              disabled={dismissMutation.isPending}
              onClick={() => dismissMutation.mutate()}
              type="button"
            >
              {t('done')}
            </Button>
          </OperatorDialogFooter>
        </OperatorDialogContent>
      </Dialog>
    </section>
  );
}
