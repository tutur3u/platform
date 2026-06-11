'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardCheck, Plus } from '@tuturuuu/icons';
import {
  createWalletCheckpoint,
  deleteWalletCheckpoint,
  listWalletCheckpoints,
  updateWalletCheckpoint,
  type WalletCheckpoint,
  type WalletCheckpointInterval,
} from '@tuturuuu/internal-api/finance';
import { Button } from '@tuturuuu/ui/button';
import { Card } from '@tuturuuu/ui/card';
import { Separator } from '@tuturuuu/ui/separator';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { toast } from '@tuturuuu/ui/sonner';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { invalidateWalletMutationQueries } from '../query-invalidation';
import { WalletCheckpointAdjustmentDialog } from './wallet-checkpoint-adjustment-dialog';
import { WalletCheckpointDeleteDialog } from './wallet-checkpoint-delete-dialog';
import { WalletCheckpointDialog } from './wallet-checkpoint-dialog';
import {
  LatestCheckpoint,
  WalletCheckpointIntervals,
  WalletCheckpointTimeline,
} from './wallet-checkpoint-sections';

function checkpointKey(wsId: string, walletId: string) {
  return ['wallet-checkpoints', wsId, walletId] as const;
}

export function WalletCheckpointPanel({
  canCreateTransactions,
  canUpdateWallets,
  currency,
  walletId,
  walletName,
  wsId,
}: {
  canCreateTransactions: boolean;
  canUpdateWallets: boolean;
  currency: string;
  walletId: string;
  walletName: string;
  wsId: string;
}) {
  const t = useTranslations('wallet-checkpoints');
  const locale = useLocale();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<WalletCheckpoint | null>(null);
  const [deleting, setDeleting] = useState<WalletCheckpoint | null>(null);
  const [adjusting, setAdjusting] = useState<WalletCheckpointInterval | null>(
    null
  );
  const query = useQuery({
    queryKey: checkpointKey(wsId, walletId),
    queryFn: () => listWalletCheckpoints(wsId, walletId, { limit: 50 }),
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: checkpointKey(wsId, walletId) });
    invalidateWalletMutationQueries(queryClient, wsId);
  };
  const createMutation = useMutation({
    mutationFn: (payload: Parameters<typeof createWalletCheckpoint>[2]) =>
      createWalletCheckpoint(wsId, walletId, payload),
    onSuccess: () => {
      toast.success(t('checkpoint_saved'));
      setCreateOpen(false);
      refresh();
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t('save_error')),
  });
  const updateMutation = useMutation({
    mutationFn: (payload: Parameters<typeof updateWalletCheckpoint>[3]) =>
      editing
        ? updateWalletCheckpoint(wsId, walletId, editing.id, payload)
        : Promise.reject(new Error(t('checkpoint_not_found'))),
    onSuccess: () => {
      toast.success(t('checkpoint_saved'));
      setEditing(null);
      refresh();
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t('save_error')),
  });
  const deleteMutation = useMutation({
    mutationFn: () =>
      deleting
        ? deleteWalletCheckpoint(wsId, walletId, deleting.id)
        : Promise.reject(new Error(t('checkpoint_not_found'))),
    onSuccess: () => {
      toast.success(t('checkpoint_deleted'));
      setDeleting(null);
      refresh();
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t('delete_error')),
  });
  const formatDate = (value: string) =>
    new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value));

  return (
    <Card className="grid gap-4 p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2 font-semibold text-lg">
            <ClipboardCheck className="h-5 w-5" />
            {t('title')}
          </div>
          <p className="text-muted-foreground text-sm">{t('description')}</p>
        </div>
        {canUpdateWallets && (
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            {t('record_checkpoint')}
          </Button>
        )}
      </div>
      <Separator />
      {query.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : query.data?.latest ? (
        <LatestCheckpoint
          checkpoint={query.data.latest}
          formatDate={formatDate}
          currency={currency}
        />
      ) : (
        <div className="rounded-md border border-dashed p-4 text-muted-foreground text-sm">
          {t('empty_state')}
        </div>
      )}
      <WalletCheckpointIntervals
        canCreateTransactions={canCreateTransactions}
        currency={currency}
        formatDate={formatDate}
        intervals={query.data?.intervals ?? []}
        onAdjust={setAdjusting}
      />
      <WalletCheckpointTimeline
        canUpdateWallets={canUpdateWallets}
        checkpoints={query.data?.data ?? []}
        formatDate={formatDate}
        onDelete={setDeleting}
        onEdit={setEditing}
      />
      <WalletCheckpointDialog
        currency={currency}
        isPending={createMutation.isPending}
        mode="create"
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSubmit={(payload) => createMutation.mutate(payload)}
      />
      <WalletCheckpointDialog
        checkpoint={editing}
        currency={currency}
        isPending={updateMutation.isPending}
        mode="edit"
        open={!!editing}
        onOpenChange={(open) => !open && setEditing(null)}
        onSubmit={(payload) => updateMutation.mutate(payload)}
      />
      <WalletCheckpointDeleteDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        isPending={deleteMutation.isPending}
        onConfirm={() => deleteMutation.mutate()}
      />
      {adjusting && (
        <WalletCheckpointAdjustmentDialog
          checkedAt={adjusting.end_checked_at}
          currency={currency}
          onCreated={refresh}
          onOpenChange={(open) => !open && setAdjusting(null)}
          open={!!adjusting}
          variance={adjusting.interval_variance}
          walletId={walletId}
          walletName={walletName}
          wsId={wsId}
        />
      )}
    </Card>
  );
}
