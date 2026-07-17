'use client';

import { useQuery } from '@tanstack/react-query';
import {
  RefreshCw,
  Settings2,
  ShieldCheck,
  TriangleAlert,
} from '@tuturuuu/icons';
import { getInventorySquareCatalogSyncState } from '@tuturuuu/internal-api/inventory';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import { SquareCatalogSyncDialog } from './square-catalog-sync-dialog';

export function SquareCatalogSyncCard({
  connected,
  dialogOpen,
  onDialogOpenChange,
  wsId,
}: {
  connected: boolean;
  dialogOpen: boolean;
  onDialogOpenChange: (open: boolean) => void;
  wsId: string;
}) {
  const t = useTranslations('inventory.operator.square.sync');
  const state = useQuery({
    enabled: connected,
    queryFn: () => getInventorySquareCatalogSyncState(wsId),
    queryKey: ['inventory', wsId, 'square-catalog-sync'],
  });
  const summary = state.data?.lastSummary;
  const status = state.data?.lastStatus;
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

      {status === 'error' && state.data?.lastError ? (
        <div
          className="flex items-start gap-2 border-destructive/30 border-b bg-destructive/5 px-4 py-3 text-destructive text-xs leading-5"
          role="alert"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <p>{t('lastError', { error: state.data.lastError })}</p>
        </div>
      ) : null}

      {summary ? (
        <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-3 xl:grid-cols-6">
          {[
            ['products', summary.itemsPulled + summary.itemsPushed],
            ['created', summary.itemsCreated],
            ['variations', summary.variationsPulled + summary.variationsPushed],
            ['stock', summary.inventoryPulled + summary.inventoryPushed],
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

      <div className="flex flex-wrap items-center justify-between gap-3 p-4">
        <p className="max-w-2xl text-muted-foreground text-xs leading-5">
          {connected ? t('manageHint') : t('connectFirst')}
        </p>
        <Button
          onClick={() => onDialogOpenChange(true)}
          size="sm"
          type="button"
          variant="outline"
        >
          <Settings2 className="size-4" />
          {t('manage')}
        </Button>
      </div>
      <SquareCatalogSyncDialog
        connected={connected}
        onOpenChange={onDialogOpenChange}
        open={dialogOpen}
        wsId={wsId}
      />
    </div>
  );
}
