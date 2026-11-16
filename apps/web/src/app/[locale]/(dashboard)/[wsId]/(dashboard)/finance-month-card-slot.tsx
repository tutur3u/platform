import {
  FinanceMonthCard,
  type FinanceMonthState,
  financeMonthRange,
  financePeriodTimeZone,
  toFinanceRecentRows,
} from '@tuturuuu/ui/workspace-dashboard/finance-month-card';
import { headers } from 'next/headers';
import { getLocale, getTranslations } from 'next-intl/server';
import { DashboardRefreshButton } from './dashboard-refresh-button';

/** Latest transactions shown on the card. */
export const RECENT_TRANSACTION_LIMIT = 3;

/**
 * Loads this month's totals and latest transactions from the Finance app on
 * the server. Both requests carry the viewer's own session through the
 * existing forwarded-auth helper (Finance is already on its origin
 * allowlist); the Finance routes enforce their permissions and withhold
 * confidential amounts. The month is the workspace's Finance period zone.
 */
export async function loadFinanceMonthState(
  wsId: string,
  workspaceTimeZone: string | null | undefined,
  now = new Date()
): Promise<FinanceMonthState> {
  const [
    { getTransactionStats, listTransactions, withForwardedInternalApiAuth },
    { getWorkspaceConfig },
    locale,
  ] = await Promise.all([
    import('@tuturuuu/internal-api'),
    import('@tuturuuu/utils/workspace-helper'),
    getLocale(),
  ]);
  const timeZone = financePeriodTimeZone(workspaceTimeZone);
  const auth = withForwardedInternalApiAuth(await headers());

  const [stats, recent, currency] = await Promise.allSettled([
    getTransactionStats(wsId, financeMonthRange(now, timeZone), auth),
    listTransactions(
      wsId,
      { page: 1, itemsPerPage: RECENT_TRANSACTION_LIMIT },
      auth
    ),
    getWorkspaceConfig(wsId, 'DEFAULT_CURRENCY'),
  ]);

  if (stats.status === 'rejected') {
    console.error('Failed to load dashboard finance summary', stats.reason);
    return { status: 'error' };
  }
  if (recent.status === 'rejected') {
    console.error('Failed to load dashboard recent transactions', recent.reason);
  }

  return {
    status: 'ready',
    income: Math.abs(Number(stats.value.totalIncome) || 0),
    expense: Math.abs(Number(stats.value.totalExpense) || 0),
    currency: (currency.status === 'fulfilled' && currency.value) || 'USD',
    locale,
    redacted: Boolean(stats.value.hasRedactedAmounts),
    monthLabel: new Intl.DateTimeFormat(locale, {
      month: 'long',
      timeZone,
    }).format(now),
    timeZone,
    recent:
      recent.status === 'fulfilled'
        ? toFinanceRecentRows(
            Array.isArray(recent.value) ? recent.value : []
          ).slice(0, RECENT_TRANSACTION_LIMIT)
        : null,
  };
}

export async function FinanceMonthCardSlot({
  wsId,
  workspaceTimeZone,
  financeHref,
  logHref,
}: {
  wsId: string;
  workspaceTimeZone: string | null | undefined;
  financeHref: string;
  /** Present only when the viewer may create transactions. */
  logHref?: string;
}) {
  const [state, t] = await Promise.all([
    loadFinanceMonthState(wsId, workspaceTimeZone),
    getTranslations('dashboard.overview'),
  ]);

  return (
    <FinanceMonthCard
      state={state}
      financeHref={financeHref}
      logHref={logHref}
      retry={<DashboardRefreshButton label={t('retry')} />}
    />
  );
}
