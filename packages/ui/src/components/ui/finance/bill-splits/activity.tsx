'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type BillSplitActivity,
  type BillSplitDetail,
  type BillSplitProof,
  downloadBillSplitProof,
  listBillSplitActivity,
  writeBillSplitActivity,
} from '@tuturuuu/internal-api/finance-bill-splits';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '../../button';
import { Input } from '../../input';
import { Label } from '../../label';
import { Skeleton } from '../../skeleton';
import { Textarea } from '../../textarea';
import { parseSplitAmount } from './amount';
import { encodeSplitProof } from './proof';

type Write = Parameters<typeof writeBillSplitActivity>[2];
type PaymentReport = Extract<BillSplitActivity, { kind: 'payment_report' }>;

export function BillSplitActivityPanel({
  wsId,
  split,
  realtime,
}: {
  wsId: string;
  split: BillSplitDetail;
  realtime: boolean;
}) {
  const t = useTranslations('bill-splits');
  const queryClient = useQueryClient();
  const activityKey = ['bill-splits', wsId, split.id, 'activity'];
  const activity = useQuery({
    queryKey: activityKey,
    queryFn: () => listBillSplitActivity(wsId, split.id),
    refetchInterval: realtime ? false : 15_000,
  });
  const [comment, setComment] = useState('');
  const [amount, setAmount] = useState('');
  const [route, setRoute] = useState('');
  const [proof, setProof] = useState<BillSplitProof>();
  const [proofLoading, setProofLoading] = useState(false);
  const [proofError, setProofError] = useState(false);
  const [fileVersion, setFileVersion] = useState(0);

  const [operation, setOperation] = useState<Write>();

  const mutation = useMutation({
    mutationFn: (event: Write) => writeBillSplitActivity(wsId, split.id, event),
    onSuccess: (_data, event) => {
      setOperation(undefined);
      if (event.kind === 'comment') setComment('');
      if (event.kind === 'payment_report') {
        setAmount('');
        setProof(undefined);
        setFileVersion((version) => version + 1);
      }
      void queryClient.invalidateQueries({
        queryKey: ['bill-splits', wsId, split.id],
      });
    },
  });

  function send(
    value:
      | Omit<Extract<Write, { kind: 'comment' }>, 'eventId'>
      | Omit<Extract<Write, { kind: 'payment_report' }>, 'eventId'>
      | Omit<Extract<Write, { kind: 'payment_confirm' }>, 'eventId'>
  ) {
    if (mutation.isPending || operation) return;
    const event = { ...value, eventId: crypto.randomUUID() };
    setOperation(event);
    mutation.mutate(event);
  }

  const participants = new Map(
    split.participants.map((person) => [person.id, person])
  );
  const routes = split.ledger.settlement.transfers.filter(
    ({ from }) => participants.get(from)?.canReport
  );
  const payment = routes.find(({ from, to }) => `${from}/${to}` === route);
  const minor = parseSplitAmount(amount, split.currency.minorDigits);
  const confirmed = new Set(
    activity.data?.flatMap((event) =>
      event.kind === 'payment_confirm' ? [event.reportId] : []
    )
  );
  const pending =
    activity.data?.filter(
      (event): event is PaymentReport =>
        event.kind === 'payment_report' && !confirmed.has(event.id)
    ) ?? [];
  const controlsDisabled =
    mutation.isPending || proofLoading || Boolean(operation);

  return (
    <section className="space-y-3">
      <h2 className="font-semibold">{t('activity')}</h2>
      {mutation.isError && operation && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-2 rounded-lg border p-3"
        >
          <span className="text-sm">{t('activity-error')}</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => mutation.mutate(operation)}
          >
            {t('retry')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              mutation.reset();
              setOperation(undefined);
            }}
          >
            {t('dismiss')}
          </Button>
        </div>
      )}
      {split.finalized && routes.length > 0 && (
        <form
          className="grid items-end gap-3 rounded-lg border p-3 sm:grid-cols-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (payment && minor > 0 && minor <= payment.amountMinor) {
              send({
                kind: 'payment_report',
                from: payment.from,
                to: payment.to,
                amountMinor: minor,
                ...(proof ? { proof } : {}),
              });
            }
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="bill-split-transfer">{t('transfer')}</Label>
            <select
              id="bill-split-transfer"
              value={route}
              disabled={controlsDisabled}
              onChange={(event) => setRoute(event.target.value)}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="">{t('choose-transfer')}</option>
              {routes.map(({ from, to }) => (
                <option key={`${from}/${to}`} value={`${from}/${to}`}>
                  {t('pays', {
                    from: participants.get(from)?.displayName ?? '',
                    to: participants.get(to)?.displayName ?? '',
                  })}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="bill-split-paid-amount">
              {t('total', { currency: split.currency.code })}
            </Label>
            <Input
              id="bill-split-paid-amount"
              inputMode="decimal"
              value={amount}
              maxLength={24}
              disabled={controlsDisabled}
              onChange={(event) => setAmount(event.target.value)}
            />
          </div>
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="bill-split-payment-proof">{t('add-proof')}</Label>
            <Input
              type="file"
              id="bill-split-payment-proof"
              key={fileVersion}
              accept="image/png,image/jpeg,image/webp"
              disabled={controlsDisabled}
              onChange={async (event) => {
                const file = event.target.files?.[0];
                setProof(undefined);
                setProofError(false);
                if (!file) return;
                setProofLoading(true);
                try {
                  setProof(await encodeSplitProof(file));
                } catch {
                  setProofError(true);
                  setFileVersion((version) => version + 1);
                } finally {
                  setProofLoading(false);
                }
              }}
            />
          </div>
          <Button
            type="submit"
            disabled={
              controlsDisabled ||
              !payment ||
              !(minor > 0 && minor <= payment.amountMinor)
            }
          >
            {t('paid')}
          </Button>
        </form>
      )}
      {proofError && (
        <p role="alert" className="text-destructive text-sm">
          {t('proof-error')}
        </p>
      )}
      {pending.length > 0 && (
        <ul className="divide-y rounded-lg border">
          {pending.map((event) => (
            <li
              className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm"
              key={event.id}
            >
              <span>
                {t('payment-pending', {
                  from: participants.get(event.from)?.displayName ?? '',
                  to: participants.get(event.to)?.displayName ?? '',
                })}
              </span>
              {participants.get(event.to)?.canConfirm && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={controlsDisabled}
                  onClick={() =>
                    send({ kind: 'payment_confirm', reportId: event.id })
                  }
                >
                  {t('confirm-payment')}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {activity.isPending ? (
        <Skeleton className="h-9" />
      ) : activity.isError ? (
        <div role="alert" className="flex flex-wrap items-center gap-2 text-sm">
          {t('activity-load-error')}
          <Button
            size="sm"
            variant="outline"
            onClick={() => activity.refetch()}
          >
            {t('retry')}
          </Button>
        </div>
      ) : (
        <ul className="divide-y rounded-lg border">
          {activity.data.map((event) => (
            <li
              key={event.id}
              className="wrap-break-word whitespace-pre-wrap px-3 py-2 text-sm"
            >
              {event.kind === 'comment'
                ? event.comment
                : t(
                    event.kind === 'payment_report'
                      ? 'payment-reported'
                      : 'payment-confirmed'
                  )}
              {event.kind === 'payment_report' && event.hasProof && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    try {
                      const blob = await downloadBillSplitProof(
                        wsId,
                        split.id,
                        event.id
                      );
                      const url = URL.createObjectURL(blob);
                      const anchor = document.createElement('a');
                      anchor.href = url;
                      anchor.download = `payment-proof.${blob.type.split('/')[1] ?? 'image'}`;
                      anchor.click();
                      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
                    } catch {
                      setProofError(true);
                    }
                  }}
                >
                  {t('download-proof')}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      <form
        className="space-y-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (comment.trim()) send({ kind: 'comment', comment });
        }}
      >
        <Label htmlFor="bill-split-comment">{t('comment')}</Label>
        <Textarea
          id="bill-split-comment"
          value={comment}
          maxLength={2000}
          disabled={controlsDisabled}
          onChange={(event) => setComment(event.target.value)}
        />
        <Button
          type="submit"
          size="sm"
          disabled={controlsDisabled || !comment.trim()}
        >
          {t('post-comment')}
        </Button>
      </form>
    </section>
  );
}
