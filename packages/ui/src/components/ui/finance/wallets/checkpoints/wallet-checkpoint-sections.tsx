'use client';

import { CheckCircle2, Pencil, Trash2, TriangleAlert } from '@tuturuuu/icons';
import type {
  WalletCheckpoint,
  WalletCheckpointInterval,
} from '@tuturuuu/internal-api/finance';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import { WalletCheckpointAmount } from './wallet-checkpoint-amount';

export function LatestCheckpoint({
  checkpoint,
  currency,
  formatDate,
}: {
  checkpoint: WalletCheckpoint;
  currency: string;
  formatDate: (value: string) => string;
}) {
  const t = useTranslations('wallet-checkpoints');
  return (
    <div className="grid gap-2 rounded-md border p-3 text-sm md:grid-cols-3">
      <Metric label={t('latest_checkpoint')}>
        {formatDate(checkpoint.checked_at)}
      </Metric>
      <Metric label={t('actual_balance')}>
        <WalletCheckpointAmount
          amount={checkpoint.actual_balance}
          currency={currency}
        />
      </Metric>
      <Metric label={t('current_variance')}>
        <WalletCheckpointAmount
          amount={checkpoint.current_variance}
          currency={currency}
          signDisplay="always"
        />
      </Metric>
    </div>
  );
}

export function WalletCheckpointIntervals({
  canCreateTransactions,
  currency,
  formatDate,
  intervals,
  onReconcile,
}: {
  canCreateTransactions: boolean;
  currency: string;
  formatDate: (value: string) => string;
  intervals: WalletCheckpointInterval[];
  onReconcile: (interval: WalletCheckpointInterval) => void;
}) {
  const t = useTranslations('wallet-checkpoints');
  if (intervals.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="font-medium text-sm">{t('intervals')}</div>
      {intervals.map((interval) => (
        <div
          key={interval.end_checkpoint_id}
          className={
            interval.is_clean
              ? 'rounded-md border border-dynamic-green/40 p-3'
              : 'rounded-md border border-dynamic-yellow/50 p-3'
          }
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm">
              {interval.is_clean ? (
                <CheckCircle2 className="h-4 w-4 text-dynamic-green" />
              ) : (
                <TriangleAlert className="h-4 w-4 text-dynamic-yellow" />
              )}
              <span>
                {formatDate(interval.start_checked_at)} -{' '}
                {formatDate(interval.end_checked_at)}
              </span>
            </div>
            <Badge variant={interval.is_clean ? 'secondary' : 'outline'}>
              {interval.is_clean ? t('clean') : t('unresolved')}
            </Badge>
          </div>
          <div className="mt-3 grid gap-2 text-sm md:grid-cols-3">
            <Metric label={t('actual_delta')}>
              <WalletCheckpointAmount
                amount={interval.actual_delta}
                currency={currency}
              />
            </Metric>
            <Metric label={t('ledger_delta')}>
              <WalletCheckpointAmount
                amount={interval.ledger_delta}
                currency={currency}
              />
            </Metric>
            <Metric label={t('variance')}>
              <WalletCheckpointAmount
                amount={interval.interval_variance}
                currency={currency}
                signDisplay="always"
              />
            </Metric>
          </div>
          {!interval.is_clean && canCreateTransactions && (
            <Button
              className="mt-3"
              size="sm"
              variant="outline"
              onClick={() => onReconcile(interval)}
            >
              {t('reconcile')}
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}

export function WalletCheckpointTimeline({
  canUpdateWallets,
  checkpoints,
  formatDate,
  onDelete,
  onEdit,
}: {
  canUpdateWallets: boolean;
  checkpoints: WalletCheckpoint[];
  formatDate: (value: string) => string;
  onDelete: (checkpoint: WalletCheckpoint) => void;
  onEdit: (checkpoint: WalletCheckpoint) => void;
}) {
  const t = useTranslations('wallet-checkpoints');
  if (checkpoints.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="font-medium text-sm">{t('timeline')}</div>
      {checkpoints.map((checkpoint) => (
        <div
          key={checkpoint.id}
          className="flex flex-col gap-2 rounded-md border p-3 md:flex-row md:items-center md:justify-between"
        >
          <div>
            <div className="font-medium text-sm">
              {formatDate(checkpoint.checked_at)}
            </div>
            <div className="text-muted-foreground text-sm">
              <WalletCheckpointAmount
                amount={checkpoint.actual_balance}
                currency={checkpoint.currency}
              />{' '}
              {checkpoint.note ? `- ${checkpoint.note}` : null}
            </div>
          </div>
          {canUpdateWallets && (
            <div className="flex items-center gap-2">
              <Button
                size="icon"
                variant="ghost"
                onClick={() => onEdit(checkpoint)}
                aria-label={t('edit_checkpoint')}
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => onDelete(checkpoint)}
                aria-label={t('delete_checkpoint')}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
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
