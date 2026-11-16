import { ChevronRight, Plus } from '@tuturuuu/icons/lucide';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { DashboardCard } from './dashboard-card';
import type { FinanceRecentRow } from './finance-period';

// Server adapters reach the period helpers through this public entry point.
export {
  financeMonthRange,
  financePeriodTimeZone,
  toFinanceRecentRows,
} from './finance-period';

export type FinanceMonthState =
  | {
      status: 'ready';
      income: number;
      expense: number;
      currency: string;
      locale: string;
      /** The route hid confidential amounts from this viewer. */
      redacted: boolean;
      monthLabel: string;
      /** Zone the month and dates are shown in (see financePeriodTimeZone). */
      timeZone: string;
      /** Up to three latest transactions; null when they could not load. */
      recent: FinanceRecentRow[] | null;
    }
  | { status: 'error' };

interface FinanceMonthCardProps {
  state: FinanceMonthState;
  /** Finance app destination for the header link. */
  financeHref: string;
  /** Retry control injected by the app adapter (it owns navigation). */
  retry?: ReactNode;
  /** Finance's create-transaction flow; omitted without permission. */
  logHref?: string;
}

function formatMoney(value: number, currency: string, locale: string) {
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(
      value
    );
  }
}

/** This month's income and spending. Rendered on the server; no hooks. */
export function FinanceMonthCard({
  state,
  financeHref,
  retry,
  logHref,
}: FinanceMonthCardProps) {
  const t = useTranslations('dashboard.overview');
  const link =
    'inline-flex items-center gap-0.5 whitespace-nowrap rounded-md px-1 text-muted-foreground text-xs hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring';

  return (
    <DashboardCard
      id="finance"
      title={state.status === 'ready' ? state.monthLabel : t('finance_title')}
      meta={state.status === 'ready' ? t('finance_title') : null}
      actions={
        <>
          {logHref ? (
            <a href={logHref} className={link}>
              <Plus aria-hidden className="size-3.5" />
              {t('log_transaction')}
            </a>
          ) : null}
          <a href={financeHref} className={link}>
            {t('open_finance')}
            <ChevronRight aria-hidden className="size-3.5" />
          </a>
        </>
      }
    >
      {state.status === 'error' ? (
        <div
          role="alert"
          className="grid min-w-0 justify-items-start gap-2 py-1 text-muted-foreground text-sm"
        >
          <span className="min-w-0 break-words">{t('finance_error')}</span>
          {retry}
        </div>
      ) : (
        <div className="grid min-w-0 gap-2">
          <dl className="grid min-w-0 grid-cols-1 gap-2 @min-[20rem]/card:grid-cols-2">
            <div className="min-w-0">
              <dt className="text-muted-foreground text-xs">{t('spent')}</dt>
              <dd className="break-words font-semibold text-dynamic-red tabular-nums">
                {formatMoney(state.expense, state.currency, state.locale)}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-muted-foreground text-xs">{t('income')}</dt>
              <dd className="break-words font-semibold text-dynamic-green tabular-nums">
                {formatMoney(state.income, state.currency, state.locale)}
              </dd>
            </div>
          </dl>
          {state.redacted ? (
            <p className="text-muted-foreground text-xs">
              {t('finance_redacted')}
            </p>
          ) : null}
          <RecentTransactions state={state} />
        </div>
      )}
    </DashboardCard>
  );
}

function RecentTransactions({
  state,
}: {
  state: Extract<FinanceMonthState, { status: 'ready' }>;
}) {
  const t = useTranslations('dashboard.overview');
  if (state.recent === null) {
    return <p className="text-muted-foreground text-xs">{t('recent_error')}</p>;
  }
  if (state.recent.length === 0) {
    return <p className="text-muted-foreground text-xs">{t('no_transactions')}</p>;
  }
  const day = new Intl.DateTimeFormat(state.locale, {
    day: 'numeric',
    month: 'short',
    timeZone: state.timeZone,
  });
  return (
    <ul aria-label={t('recent_transactions')} className="grid min-w-0 border-t pt-1">
      {state.recent.map((row) => (
        <li key={row.id} className="flex min-h-9 min-w-0 items-center gap-3 text-sm">
          <span className="min-w-0 flex-1 truncate" title={row.label ?? undefined}>
            {row.label ?? t('untitled_transaction')}
          </span>
          <span className="shrink-0 text-muted-foreground text-xs">
            {day.format(new Date(row.takenAt))}
          </span>
          <span className="shrink-0 font-mono text-xs tabular-nums">
            {row.amount === null ? (
              <>
                <span aria-hidden>•••</span>
                <span className="sr-only">{t('amount_hidden')}</span>
              </>
            ) : (
              formatMoney(row.amount, state.currency, state.locale)
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function FinanceMonthCardSkeleton({ label }: { label: string }) {
  return (
    <section
      data-dashboard-card="finance"
      aria-busy="true"
      className="min-w-0 rounded-xl border bg-card p-4"
    >
      <div role="status" className="grid gap-2">
        <span aria-hidden className="h-4 w-1/3 rounded bg-muted motion-safe:animate-pulse" />
        <span aria-hidden className="h-6 w-2/3 rounded bg-muted motion-safe:animate-pulse" />
        <span className="sr-only">{label}</span>
      </div>
    </section>
  );
}
