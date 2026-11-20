'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Receipt } from '@tuturuuu/icons';
import {
  getBillSplit,
  listBillSplits,
} from '@tuturuuu/internal-api/finance-bill-splits';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { Button } from '../../button';
import { Skeleton } from '../../skeleton';
import { BillSplitActivityPanel } from './activity';
import { BillSplitContactBank } from './contact-bank';
import { BillSplitCreate } from './create';
import { BillSplitLedgerView } from './ledger';
import { BillSplitReminder } from './reminder';
import { BillSplitStatusLinks } from './status-links';
import { useBillSplitRealtime } from './use-realtime';

export function BillSplitsPage({
  wsId,
  locale,
  currency,
  canCreate,
  canShare,
  bankEnabled,
  canReadBank,
  realtimeEnabled,
  remindersEnabled,
  splitId,
  participantId,
  settlement,
}: {
  wsId: string;
  locale: string;
  currency: string;
  canCreate: boolean;
  canShare: boolean;
  bankEnabled: boolean;
  canReadBank: boolean;
  realtimeEnabled: boolean;
  remindersEnabled: boolean;
  splitId?: string;
  participantId?: string;
  settlement?: boolean;
}) {
  const t = useTranslations('bill-splits');
  const realtime = useBillSplitRealtime(wsId, splitId, realtimeEnabled);
  const base = `/${locale}/${wsId}/bill-splits`;
  const listing = useQuery({
    queryKey: ['bill-splits', wsId],
    queryFn: () => listBillSplits(wsId),
    enabled: !splitId,
  });
  const detail = useQuery({
    queryKey: ['bill-splits', wsId, splitId],
    queryFn: () => getBillSplit(wsId, splitId ?? ''),
    enabled: Boolean(splitId),
    refetchInterval: realtime ? false : 15_000,
  });

  if (splitId) {
    if (detail.isPending) return <SplitSkeleton title={t('loading')} />;
    if (detail.isError)
      return (
        <SplitError
          text={t('open-error')}
          retry={t('retry')}
          onRetry={() => detail.refetch()}
        />
      );
    const split = detail.data;
    const participant = split.participants.find(
      ({ id }) => id === participantId
    );
    if (participantId && !participant)
      return <p role="alert">{t('participant-not-found')}</p>;
    return (
      <div className="space-y-5">
        <header>
          <Link
            href={base}
            className="text-sm text-muted-foreground hover:underline"
          >
            {t('title')}
          </Link>
          <h1 className="mt-2 font-semibold text-2xl tracking-tight">
            {participant ? participant.displayName : split.title}
          </h1>
          {settlement && (
            <p className="mt-1 text-sm text-muted-foreground">
              {t('settlement')}
            </p>
          )}
        </header>
        <BillSplitLedgerView {...split} participantId={participantId} />
        {!participantId && (
          <BillSplitActivityPanel
            wsId={wsId}
            split={split}
            realtime={realtime}
          />
        )}
        {!participantId && (
          <nav aria-label={t('participants')} className="flex flex-wrap gap-2">
            {split.participants.map((participant) => (
              <Button key={participant.id} asChild variant="outline" size="sm">
                <Link
                  href={`${base}/${splitId}/participants/${participant.id}`}
                >
                  {participant.displayName}
                </Link>
              </Button>
            ))}
            <Button asChild variant="outline" size="sm">
              <Link href={`${base}/${splitId}/settlement`}>
                {t('settlement')}
              </Link>
            </Button>
            {bankEnabled && (
              <BillSplitContactBank
                wsId={wsId}
                participants={split.participants}
                canRead={canReadBank}
              />
            )}
            {remindersEnabled &&
              canCreate &&
              split.finalized &&
              split.canManage && (
                <BillSplitReminder wsId={wsId} split={split} />
              )}
            {canShare && split.finalized && split.canManage && (
              <BillSplitStatusLinks
                wsId={wsId}
                split={split}
                bankEnabled={bankEnabled}
              />
            )}
          </nav>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-semibold text-2xl tracking-tight">{t('title')}</h1>
        {canCreate && <BillSplitCreate wsId={wsId} currency={currency} />}
      </header>
      {listing.isPending ? (
        <SplitSkeleton title={t('loading')} />
      ) : listing.isError ? (
        <SplitError
          text={t('list-error')}
          retry={t('retry')}
          onRetry={() => listing.refetch()}
        />
      ) : listing.data.length ? (
        <ul className="divide-y rounded-xl border bg-card">
          {listing.data.map((split) => (
            <li key={split.id}>
              <Link
                href={`${base}/${split.id}`}
                className="flex items-center gap-4 px-4 py-3 hover:bg-accent focus-visible:outline-ring"
              >
                <Receipt aria-hidden className="size-4 shrink-0" />
                <span className="min-w-0 grow truncate font-medium text-sm">
                  {split.title}
                </span>
                <span className="text-muted-foreground text-sm">
                  {split.currency.code}
                </span>
                <ArrowRight
                  aria-hidden
                  className="size-4 shrink-0 text-muted-foreground"
                />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl border bg-card p-5 text-muted-foreground text-sm">
          {t('empty')}
        </p>
      )}
    </div>
  );
}

function SplitSkeleton({ title }: { title: string }) {
  return (
    <div role="status" aria-label={title} className="grid gap-2">
      <Skeleton className="h-11" />
      <Skeleton className="h-11" />
    </div>
  );
}

function SplitError({
  text,
  retry,
  onRetry,
}: {
  text: string;
  retry: string;
  onRetry: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4"
    >
      <span className="text-sm">{text}</span>
      <Button variant="outline" size="sm" onClick={onRetry}>
        {retry}
      </Button>
    </div>
  );
}
