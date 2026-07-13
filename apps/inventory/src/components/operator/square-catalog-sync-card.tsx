'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw, ShieldCheck } from '@tuturuuu/icons';
import {
  getInventorySquareCatalogSyncState,
  type InventorySquareCatalogSyncDirection,
  syncInventorySquareCatalog,
} from '@tuturuuu/internal-api/inventory';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@tuturuuu/ui/alert-dialog';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

const directions: InventorySquareCatalogSyncDirection[] = [
  'from_square',
  'to_square',
  'bidirectional',
];

export function SquareCatalogSyncCard({
  actionsEnabled,
  connected,
  wsId,
}: {
  actionsEnabled: boolean;
  connected: boolean;
  wsId: string;
}) {
  const t = useTranslations('inventory.operator.square.sync');
  const queryClient = useQueryClient();
  const [pendingDirection, setPendingDirection] =
    useState<InventorySquareCatalogSyncDirection | null>(null);
  const state = useQuery({
    enabled: connected,
    queryFn: () => getInventorySquareCatalogSyncState(wsId),
    queryKey: ['inventory', wsId, 'square-catalog-sync'],
  });
  const sync = useMutation({
    mutationFn: (direction: InventorySquareCatalogSyncDirection) =>
      syncInventorySquareCatalog(wsId, direction),
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t('error')),
    onSuccess: (summary) => {
      toast.success(summary.conflicts > 0 ? t('partialSuccess') : t('success'));
      queryClient.invalidateQueries({
        queryKey: ['inventory', wsId, 'square-catalog-sync'],
      });
    },
  });
  const summary = sync.data ?? state.data?.lastSummary;
  const status = sync.isPending ? 'running' : state.data?.lastStatus;
  const badgeVariant =
    status === 'success'
      ? 'success'
      : status === 'error'
        ? 'error'
        : status === 'partial'
          ? 'warning'
          : 'outline';

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex flex-wrap items-start justify-between gap-3 p-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-1 inline-flex size-9 items-center justify-center rounded-md border border-border bg-primary/10 text-primary">
            <RefreshCw className="size-4" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold">{t('title')}</p>
              {status ? (
                <Badge variant={badgeVariant}>{t(`status.${status}`)}</Badge>
              ) : null}
            </div>
            <p className="mt-1 max-w-2xl text-muted-foreground text-sm">
              {t('description')}
            </p>
          </div>
        </div>
        {state.data?.updatedAt ? (
          <p className="text-muted-foreground text-xs">
            {t('lastRun', {
              date: new Date(state.data.updatedAt).toLocaleString(),
            })}
          </p>
        ) : null}
      </div>

      <div className="border-border border-y bg-muted/20 px-4 py-3">
        <div className="flex items-start gap-2">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
          <div>
            <p className="font-medium text-sm">{t('safetyTitle')}</p>
            <p className="mt-0.5 text-muted-foreground text-xs">
              {t('safetyDescription')}
            </p>
          </div>
        </div>
      </div>

      {summary ? (
        <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-4">
          {[
            ['pulled', summary.variationsPulled + summary.inventoryPulled],
            ['pushed', summary.variationsPushed + summary.inventoryPushed],
            ['conflicts', summary.conflicts],
            ['preserved', summary.preservedRemoteDeletions],
          ].map(([label, value]) => (
            <div className="bg-card px-4 py-3" key={label}>
              <p className="font-semibold text-lg tabular-nums">{value}</p>
              <p className="text-muted-foreground text-xs">
                {t(`metrics.${label}`)}
              </p>
            </div>
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2 p-4">
        {actionsEnabled
          ? directions.map((direction) => (
              <Button
                disabled={!connected || sync.isPending}
                key={direction}
                onClick={() => setPendingDirection(direction)}
                type="button"
                variant={direction === 'bidirectional' ? 'default' : 'outline'}
              >
                <RefreshCw className={sync.isPending ? 'animate-spin' : ''} />
                {t(`actions.${direction}`)}
              </Button>
            ))
          : null}
        {!actionsEnabled ? (
          <p className="w-full text-muted-foreground text-xs">
            {t('editToSync')}
          </p>
        ) : !connected ? (
          <p className="w-full text-muted-foreground text-xs">
            {t('connectFirst')}
          </p>
        ) : null}
      </div>

      <AlertDialog
        onOpenChange={(open) => !open && setPendingDirection(null)}
        open={pendingDirection !== null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('confirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDirection
                ? t(`confirm.${pendingDirection}`)
                : t('confirmTitle')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="rounded-md border border-border bg-muted/30 p-3 text-muted-foreground text-xs">
            {t('safetyDescription')}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingDirection) sync.mutate(pendingDirection);
              }}
            >
              {t('confirmAction')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
