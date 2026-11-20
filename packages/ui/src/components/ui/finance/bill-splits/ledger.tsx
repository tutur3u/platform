'use client';

import type { BillSplitLedger } from '@tuturuuu/internal-api/finance-bill-splits';
import { useLocale, useTranslations } from 'next-intl';
import {
  FINANCE_HIDDEN_AMOUNT,
  useFinanceConfidentialVisibility,
} from '../shared/use-finance-confidential-visibility';

export function BillSplitLedgerView({
  currency,
  ledger,
  participants,
  participantId,
}: {
  currency: { code: string; minorDigits: number };
  ledger: BillSplitLedger;
  participants: readonly { id: string; displayName: string }[];
  participantId?: string;
}) {
  const t = useTranslations('bill-splits');
  const locale = useLocale();
  const { isConfidential } = useFinanceConfidentialVisibility();
  const formatter = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency.code,
    minimumFractionDigits: currency.minorDigits,
    maximumFractionDigits: currency.minorDigits,
  });
  const amount = (minor: number) =>
    isConfidential
      ? FINANCE_HIDDEN_AMOUNT
      : formatter.format(minor / 10 ** currency.minorDigits);
  const names = new Map(
    participants.map((participant) => [participant.id, participant.displayName])
  );
  const balances = ledger.balances.filter(
    (balance) => !participantId || balance.participantId === participantId
  );
  const transfers = ledger.settlement.transfers.filter(
    ({ from, to }) =>
      !participantId || from === participantId || to === participantId
  );

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <section className="rounded-xl border bg-card">
        <h2 className="px-4 py-3 font-medium">{t('balances')}</h2>
        <ul className="divide-y border-t">
          {balances.map((balance) => (
            <li
              key={balance.participantId}
              className="flex justify-between gap-4 px-4 py-3 text-sm"
            >
              <span>{names.get(balance.participantId)}</span>
              <span className="shrink-0 tabular-nums">
                {amount(balance.amountMinor)}
              </span>
            </li>
          ))}
        </ul>
      </section>
      <section className="rounded-xl border bg-card">
        <h2 className="px-4 py-3 font-medium">
          {t(ledger.settlement.optimal ? 'settlement' : 'suggested-settlement')}
        </h2>
        {transfers.length ? (
          <ul className="divide-y border-t">
            {transfers.map(({ from, to, amountMinor }) => (
              <li
                key={`${from}:${to}`}
                className="flex justify-between gap-4 px-4 py-3 text-sm"
              >
                <span>
                  {t('pays', {
                    from: names.get(from) ?? '',
                    to: names.get(to) ?? '',
                  })}
                </span>
                <span className="shrink-0 tabular-nums">
                  {amount(amountMinor)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="border-t px-4 py-3 text-sm text-muted-foreground">
            {t('no-transfers')}
          </p>
        )}
      </section>
    </div>
  );
}
