'use client';

import { Wallet } from '@tuturuuu/icons';
import { useFormatter, useTranslations } from 'next-intl';
import type { ArtifactRow } from './mira-artifact-data';

export function MiraFinanceArtifact({
  rows,
  href,
}: {
  rows: ArtifactRow[];
  href?: string;
}) {
  const t = useTranslations('dashboard.mira_workspace');
  const format = useFormatter();
  const currencies = [...new Set(rows.map((row) => row.currency ?? ''))].sort();
  return (
    <div className="space-y-4">
      {currencies.map((currency) => {
        const wallets = rows
          .filter((row) => (row.currency ?? '') === currency)
          .sort((a, b) => Math.abs(b.amount ?? 0) - Math.abs(a.amount ?? 0));
        const total = wallets.reduce((sum, row) => sum + (row.amount ?? 0), 0);
        const magnitude = wallets.reduce(
          (sum, row) => sum + Math.abs(row.amount ?? 0),
          0
        );
        return (
          <section
            key={currency}
            className="space-y-2"
            aria-label={currency || t('unknown_currency')}
          >
            <div className="rounded-lg border border-chart-3/15 bg-chart-3/5 p-3">
              <div className="flex items-center justify-between gap-2 text-muted-foreground text-xs">
                <span>{t('net_balance')}</span>
                <span className="font-medium">
                  {currency || t('unknown_currency')}
                </span>
              </div>
              <p
                className={`mt-1 break-words font-semibold text-xl tabular-nums tracking-tight ${total < 0 ? 'text-destructive' : ''}`}
              >
                {format.number(total, { maximumFractionDigits: 2 })}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {t('wallet_count', { count: wallets.length })}
              </p>
            </div>
            <ul className="space-y-0.5">
              {wallets.map((row) => (
                <li
                  key={row.id}
                  className="rounded-md px-1 py-2 hover:bg-muted/30"
                >
                  <div className="flex items-start gap-2">
                    <Wallet
                      aria-hidden
                      className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
                    />
                    <span
                      className="min-w-0 flex-1 truncate text-xs"
                      title={row.title}
                    >
                      {href ? (
                        <a
                          href={`${href}/${encodeURIComponent(row.id)}`}
                          target="_blank"
                          rel="noreferrer"
                          className="hover:underline focus-visible:underline"
                        >
                          {row.title}
                        </a>
                      ) : (
                        row.title
                      )}
                    </span>
                    <span
                      className={`shrink-0 font-medium text-xs tabular-nums ${(row.amount ?? 0) < 0 ? 'text-destructive' : ''}`}
                    >
                      {format.number(row.amount ?? 0, {
                        maximumFractionDigits: 2,
                      })}
                    </span>
                  </div>
                  <meter
                    className="sr-only"
                    aria-label={t('balance_share', { name: row.title })}
                    min={0}
                    max={100}
                    value={
                      magnitude
                        ? (Math.abs(row.amount ?? 0) / magnitude) * 100
                        : 0
                    }
                  />
                  <div
                    aria-hidden
                    className="mt-1.5 ml-5.5 h-1 overflow-hidden rounded-full bg-muted"
                  >
                    <div
                      className={`h-full rounded-full ${(row.amount ?? 0) < 0 ? 'bg-destructive/70' : 'bg-chart-2/70'}`}
                      style={{
                        width: `${magnitude ? (Math.abs(row.amount ?? 0) / magnitude) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      <p className="text-[11px] text-muted-foreground">{t('balance_note')}</p>
    </div>
  );
}
