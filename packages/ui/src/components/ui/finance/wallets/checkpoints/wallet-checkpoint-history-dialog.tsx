'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, History, Search } from '@tuturuuu/icons';
import {
  getWalletCheckpointHistory,
  type WalletCheckpoint,
  type WalletCheckpointAuditStatus,
  type WalletCheckpointHistoryInterval,
} from '@tuturuuu/internal-api/finance';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Input } from '@tuturuuu/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { cn } from '@tuturuuu/utils/format';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { invalidateWalletMutationQueries } from '../query-invalidation';
import { WalletCheckpointAdjustmentDialog } from './wallet-checkpoint-adjustment-dialog';
import { WalletCheckpointAmount } from './wallet-checkpoint-amount';

const ALL = 'all';

type CheckpointStatus = 'clean' | 'no_checkpoint' | 'unresolved';

type ReconcileTarget = {
  checkedAt: string;
  checkpointId: string;
  currency: string;
  variance: number;
  walletId: string;
  walletName: string;
};

type WindowRow =
  | {
      interval: WalletCheckpointHistoryInterval;
      status: Exclude<CheckpointStatus, 'no_checkpoint'>;
      type: 'interval';
    }
  | {
      auditStatus: WalletCheckpointAuditStatus;
      currency: string;
      type: 'no_checkpoint';
      walletName: string | null;
    };

export function WalletCheckpointHistoryDialog({
  canCreateTransactions,
  financePrefix = '/finance',
  wsId,
}: {
  canCreateTransactions: boolean;
  financePrefix?: string;
  wsId: string;
}) {
  const t = useTranslations('wallet-checkpoints');
  const locale = useLocale();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [currency, setCurrency] = useState(ALL);
  const [status, setStatus] = useState<typeof ALL | CheckpointStatus>(ALL);
  const [reconcileTarget, setReconcileTarget] =
    useState<ReconcileTarget | null>(null);
  const query = useQuery({
    queryKey: ['wallet-checkpoint-history', wsId],
    queryFn: () => getWalletCheckpointHistory(wsId, { limit: 100 }),
    enabled: open,
  });
  const formatDate = (value: string) =>
    new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value));
  const wallets = query.data?.wallets ?? [];
  const walletById = useMemo(
    () => new Map(wallets.map((wallet) => [wallet.id, wallet])),
    [wallets]
  );
  const auditStatusByWalletId = useMemo(
    () =>
      new Map(
        (query.data?.audit_statuses ?? []).map((auditStatus) => [
          auditStatus.wallet_id,
          auditStatus,
        ])
      ),
    [query.data?.audit_statuses]
  );
  const currencies = useMemo(() => {
    const values = new Set<string>();
    for (const wallet of wallets) values.add(wallet.currency);
    for (const interval of query.data?.intervals ?? []) {
      values.add(interval.currency);
    }
    for (const checkpoint of query.data?.checkpoints ?? []) {
      values.add(checkpoint.currency);
    }
    return [...values].sort((a, b) => a.localeCompare(b));
  }, [query.data?.checkpoints, query.data?.intervals, wallets]);
  const normalizedSearch = search.trim().toLowerCase();
  const windowRows = useMemo<WindowRow[]>(() => {
    const intervals = (query.data?.intervals ?? []).map((interval) => {
      const status: Exclude<CheckpointStatus, 'no_checkpoint'> =
        interval.is_clean ? 'clean' : 'unresolved';

      return {
        interval,
        status,
        type: 'interval' as const,
      };
    });
    const noCheckpointRows = (query.data?.audit_statuses ?? [])
      .filter((auditStatus) => auditStatus.status === 'no_checkpoint')
      .map((auditStatus) => {
        const wallet = walletById.get(auditStatus.wallet_id);
        return {
          auditStatus,
          currency: wallet?.currency ?? 'USD',
          type: 'no_checkpoint' as const,
          walletName: wallet?.name ?? null,
        };
      });

    return [...intervals, ...noCheckpointRows];
  }, [query.data?.audit_statuses, query.data?.intervals, walletById]);
  const filteredWindowRows = windowRows.filter((row) => {
    const rowCurrency =
      row.type === 'interval' ? row.interval.currency : row.currency;
    const rowStatus = row.type === 'interval' ? row.status : 'no_checkpoint';
    const walletName =
      row.type === 'interval' ? row.interval.wallet_name : row.walletName;

    return (
      (currency === ALL || rowCurrency === currency) &&
      (status === ALL || rowStatus === status) &&
      (!normalizedSearch ||
        (walletName ?? '').toLowerCase().includes(normalizedSearch))
    );
  });
  const filteredCheckpoints = (query.data?.checkpoints ?? []).filter(
    (checkpoint) => {
      const wallet = walletById.get(checkpoint.wallet_id);
      const checkpointStatus = getCheckpointStatus(
        checkpoint,
        auditStatusByWalletId.get(checkpoint.wallet_id)
      );

      return (
        (currency === ALL || checkpoint.currency === currency) &&
        (status === ALL || checkpointStatus === status) &&
        (!normalizedSearch ||
          (wallet?.name ?? '').toLowerCase().includes(normalizedSearch))
      );
    }
  );

  const refresh = () => {
    queryClient.invalidateQueries({
      queryKey: ['wallet-checkpoint-history', wsId],
    });
    invalidateWalletMutationQueries(queryClient, wsId);
  };

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <History className="mr-2 h-4 w-4" />
        {t('checkpoint_history')}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[92vh] w-[min(96vw,1200px)] max-w-none flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>{t('checkpoint_history')}</DialogTitle>
            <DialogDescription>
              {t('checkpoint_history_description')}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 md:grid-cols-[1fr_180px_180px]">
            <div className="relative">
              <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t('search_wallets')}
              />
            </div>
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t('all_currencies')}</SelectItem>
                {currencies.map((value) => (
                  <SelectItem key={value} value={value}>
                    {value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={status}
              onValueChange={(value) =>
                setStatus(value as typeof ALL | CheckpointStatus)
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t('all_statuses')}</SelectItem>
                <SelectItem value="clean">{t('clean')}</SelectItem>
                <SelectItem value="unresolved">{t('unresolved')}</SelectItem>
                <SelectItem value="no_checkpoint">
                  {t('no_checkpoint')}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Tabs defaultValue="windows" className="min-h-0 flex-1">
            <TabsList>
              <TabsTrigger value="windows">{t('windows')}</TabsTrigger>
              <TabsTrigger value="checkpoints">{t('checkpoints')}</TabsTrigger>
            </TabsList>
            <TabsContent value="windows" className="min-h-0">
              <div className="max-h-[58vh] space-y-3 overflow-y-auto pr-1">
                {query.isLoading ? (
                  <HistorySkeleton />
                ) : filteredWindowRows.length === 0 ? (
                  <EmptyState>{t('no_windows')}</EmptyState>
                ) : (
                  filteredWindowRows.map((row) =>
                    row.type === 'interval' ? (
                      <IntervalRow
                        key={row.interval.end_checkpoint_id}
                        canCreateTransactions={canCreateTransactions}
                        formatDate={formatDate}
                        interval={row.interval}
                        onReconcile={setReconcileTarget}
                      />
                    ) : (
                      <NoCheckpointRow
                        key={row.auditStatus.wallet_id}
                        auditStatus={row.auditStatus}
                        currency={row.currency}
                        walletName={row.walletName}
                      />
                    )
                  )
                )}
              </div>
            </TabsContent>
            <TabsContent value="checkpoints" className="min-h-0">
              <div className="max-h-[58vh] space-y-3 overflow-y-auto pr-1">
                {query.isLoading ? (
                  <HistorySkeleton />
                ) : filteredCheckpoints.length === 0 ? (
                  <EmptyState>{t('no_checkpoints')}</EmptyState>
                ) : (
                  filteredCheckpoints.map((checkpoint) => {
                    const wallet = walletById.get(checkpoint.wallet_id);
                    const auditStatus = auditStatusByWalletId.get(
                      checkpoint.wallet_id
                    );

                    return (
                      <CheckpointRow
                        key={checkpoint.id}
                        auditStatus={auditStatus}
                        canCreateTransactions={canCreateTransactions}
                        checkpoint={checkpoint}
                        financePrefix={financePrefix}
                        formatDate={formatDate}
                        onReconcile={setReconcileTarget}
                        walletName={wallet?.name ?? null}
                        wsId={wsId}
                      />
                    );
                  })
                )}
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
      {reconcileTarget && (
        <WalletCheckpointAdjustmentDialog
          checkedAt={reconcileTarget.checkedAt}
          checkpointId={reconcileTarget.checkpointId}
          currency={reconcileTarget.currency}
          onCreated={refresh}
          onOpenChange={(nextOpen) => !nextOpen && setReconcileTarget(null)}
          open={!!reconcileTarget}
          variance={reconcileTarget.variance}
          walletId={reconcileTarget.walletId}
          walletName={reconcileTarget.walletName}
          wsId={wsId}
        />
      )}
    </>
  );
}

function IntervalRow({
  canCreateTransactions,
  formatDate,
  interval,
  onReconcile,
}: {
  canCreateTransactions: boolean;
  formatDate: (value: string) => string;
  interval: WalletCheckpointHistoryInterval;
  onReconcile: (target: ReconcileTarget) => void;
}) {
  const t = useTranslations('wallet-checkpoints');
  const status: CheckpointStatus = interval.is_clean ? 'clean' : 'unresolved';

  return (
    <div
      className={cn(
        'grid gap-3 rounded-md border p-3',
        interval.is_clean
          ? 'border-dynamic-green/40'
          : 'border-dynamic-yellow/50'
      )}
    >
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="font-medium text-sm">
            {interval.wallet_name ?? interval.wallet_id}
          </div>
          <div className="text-muted-foreground text-xs">
            {formatDate(interval.start_checked_at)} -{' '}
            {formatDate(interval.end_checked_at)}
          </div>
        </div>
        <StatusBadge status={status} />
      </div>
      <div className="grid gap-3 text-sm md:grid-cols-4">
        <Metric label={t('actual_delta')}>
          <WalletCheckpointAmount
            amount={interval.actual_delta}
            currency={interval.currency}
            signDisplay="always"
          />
        </Metric>
        <Metric label={t('ledger_delta')}>
          <WalletCheckpointAmount
            amount={interval.ledger_delta}
            currency={interval.currency}
            signDisplay="always"
          />
        </Metric>
        <Metric label={t('variance')}>
          <WalletCheckpointAmount
            amount={interval.interval_variance}
            currency={interval.currency}
            signDisplay="always"
          />
        </Metric>
        <Metric label={t('transaction_count')}>
          {interval.transaction_count}
        </Metric>
      </div>
      {!interval.is_clean && canCreateTransactions && (
        <div>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              onReconcile({
                checkedAt: interval.end_checked_at,
                checkpointId: interval.end_checkpoint_id,
                currency: interval.currency,
                variance: interval.interval_variance,
                walletId: interval.wallet_id,
                walletName: interval.wallet_name ?? interval.wallet_id,
              })
            }
          >
            {t('reconcile')}
          </Button>
        </div>
      )}
    </div>
  );
}

function NoCheckpointRow({
  auditStatus,
  currency,
  walletName,
}: {
  auditStatus: WalletCheckpointAuditStatus;
  currency: string;
  walletName: string | null;
}) {
  const t = useTranslations('wallet-checkpoints');

  return (
    <div className="grid gap-3 rounded-md border border-dashed p-3">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="font-medium text-sm">
            {walletName ?? auditStatus.wallet_id}
          </div>
          <div className="text-muted-foreground text-xs">
            {t('no_checkpoint_detail')}
          </div>
        </div>
        <StatusBadge status="no_checkpoint" />
      </div>
      <Metric label={t('ledger_balance')}>
        <WalletCheckpointAmount
          amount={auditStatus.ledger_balance}
          currency={currency}
        />
      </Metric>
    </div>
  );
}

function CheckpointRow({
  auditStatus,
  canCreateTransactions,
  checkpoint,
  financePrefix,
  formatDate,
  onReconcile,
  walletName,
  wsId,
}: {
  auditStatus?: WalletCheckpointAuditStatus;
  canCreateTransactions: boolean;
  checkpoint: WalletCheckpoint;
  financePrefix: string;
  formatDate: (value: string) => string;
  onReconcile: (target: ReconcileTarget) => void;
  walletName: string | null;
  wsId: string;
}) {
  const t = useTranslations('wallet-checkpoints');
  const isLatest = auditStatus?.latest_checkpoint_id === checkpoint.id;
  const checkpointStatus = getCheckpointStatus(checkpoint, auditStatus);
  const variance = isLatest
    ? (auditStatus?.variance ?? checkpoint.current_variance)
    : checkpoint.current_variance;

  return (
    <div className="grid gap-3 rounded-md border p-3">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="font-medium text-sm">
            {walletName ?? checkpoint.wallet_id}
          </div>
          <div className="text-muted-foreground text-xs">
            {formatDate(checkpoint.checked_at)}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={checkpointStatus} />
          <Button size="sm" variant="ghost" asChild>
            <Link
              href={`/${wsId}${financePrefix}/wallets/${checkpoint.wallet_id}`}
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              {t('open_wallet')}
            </Link>
          </Button>
        </div>
      </div>
      <div className="grid gap-3 text-sm md:grid-cols-5">
        <Metric label={t('actual_balance')}>
          <WalletCheckpointAmount
            amount={checkpoint.actual_balance}
            currency={checkpoint.currency}
          />
        </Metric>
        <Metric label={t('ledger_at_checkpoint')}>
          <WalletCheckpointAmount
            amount={checkpoint.ledger_balance}
            currency={checkpoint.currency}
          />
        </Metric>
        <Metric label={t('post_checkpoint_delta')}>
          {isLatest && auditStatus ? (
            <WalletCheckpointAmount
              amount={auditStatus.post_checkpoint_delta}
              currency={checkpoint.currency}
              signDisplay="always"
            />
          ) : (
            '-'
          )}
        </Metric>
        <Metric label={t('audited_balance')}>
          {isLatest && auditStatus ? (
            <WalletCheckpointAmount
              amount={auditStatus.audited_balance}
              currency={checkpoint.currency}
            />
          ) : (
            '-'
          )}
        </Metric>
        <Metric label={t('variance')}>
          <WalletCheckpointAmount
            amount={variance}
            currency={checkpoint.currency}
            signDisplay="always"
          />
        </Metric>
      </div>
      {checkpoint.note && (
        <div className="text-muted-foreground text-sm">
          {t('note')}: {checkpoint.note}
        </div>
      )}
      {variance !== 0 && canCreateTransactions && (
        <div>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              onReconcile({
                checkedAt: checkpoint.checked_at,
                checkpointId: checkpoint.id,
                currency: checkpoint.currency,
                variance,
                walletId: checkpoint.wallet_id,
                walletName: walletName ?? checkpoint.wallet_id,
              })
            }
          >
            {t('reconcile')}
          </Button>
        </div>
      )}
    </div>
  );
}

function getCheckpointStatus(
  checkpoint: WalletCheckpoint,
  auditStatus?: WalletCheckpointAuditStatus
): CheckpointStatus {
  if (auditStatus?.latest_checkpoint_id === checkpoint.id) {
    return auditStatus.status;
  }

  return checkpoint.current_variance === 0 ? 'clean' : 'unresolved';
}

function StatusBadge({ status }: { status: CheckpointStatus }) {
  const t = useTranslations('wallet-checkpoints');

  if (status === 'clean') {
    return <Badge variant="secondary">{t('clean')}</Badge>;
  }

  if (status === 'no_checkpoint') {
    return <Badge variant="outline">{t('no_checkpoint')}</Badge>;
  }

  return <Badge variant="outline">{t('unresolved')}</Badge>;
}

function Metric({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <div>
      <div className="text-muted-foreground text-xs">{label}</div>
      <div className="font-medium">{children}</div>
    </div>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-dashed p-4 text-muted-foreground text-sm">
      {children}
    </div>
  );
}

function HistorySkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}
