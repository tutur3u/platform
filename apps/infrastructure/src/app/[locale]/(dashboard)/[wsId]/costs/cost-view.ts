import type {
  InfrastructureCostCollection,
  InfrastructureCostCompleteDays,
  InfrastructureCostDay,
  InfrastructureCostInvoice,
  InfrastructureCostsResponse,
  InfrastructureRecordedCost,
} from '@tuturuuu/internal-api/infrastructure';
import { joinAppUrl } from '@tuturuuu/utils/app-mounts';
import {
  type CostAnomaly,
  type CostDimension,
  type CostWindow,
  type DailyCostRow,
  detectAnomalies,
  forecastMonth,
  type MonthForecast,
  RUN_RATE_DAYS,
  periodCoverage,
  trailingCoverage,
  trailingBilled,
} from '@/lib/admin-costs/trends';

// Providers the inventory tracks; those without a collector show as gaps.
export const INVENTORY_PROVIDERS = [
  'cloudflare',
  'vercel',
  'supabase',
  'github',
  'google-cloud',
  'openai',
  'anthropic',
  'aws',
] as const;

export type Section<T> = { kind: 'ok'; data: T } | { kind: 'unavailable' };

export interface CostOverview {
  month: string;
  toDateUsd: number;
  forecastUsd: number;
  previousMonthUsd: number;
  /** Completed-day data could not be read, so no total can be verified. */
  verificationUnavailable: boolean;
  /** Whether any provider has a verified day for each tile's inputs. */
  measured: {
    toDate: boolean;
    forecast: boolean;
    previous: boolean;
  };
  /** Each total covers only part of its period. */
  partial: {
    toDate: boolean;
    forecast: boolean;
    previous: boolean;
    perUser: boolean;
  };
  /**
   * Collected billed spend over the last 30 complete UTC days divided by
   * users active in the 30 days up to now. The windows differ by the current
   * day, so this is an estimate.
   */
  spendPerActiveUserUsd: Section<number | null>;
}

export type CostCoverageData = {
  collected: InfrastructureCostCollection[];
  missing: string[];
};

export interface ReadyCosts {
  kind: 'ready';
  lastCompleteDay: string;
  rootWorkspaceId: string;
  overview: Section<CostOverview>;
  breakdown: Section<Record<CostDimension, MonthForecast[]>>;
  daily: Section<DailyCostRow[]>;
  anomalies: Section<CostAnomaly[]>;
  invoices: Section<InfrastructureCostInvoice[]>;
  recorded: Section<InfrastructureRecordedCost[]>;
  coverage: Section<CostCoverageData>;
}

export type CostsView =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'empty'; coverage: Section<CostCoverageData> }
  | ReadyCosts;

const section = <T, R>(
  source: { status: 'ok'; data: T } | { status: 'unavailable' },
  map: (data: T) => R
): Section<R> =>
  source.status === 'ok'
    ? { data: map(source.data), kind: 'ok' }
    : { kind: 'unavailable' };

export function buildCostsView(
  query:
    | { status: 'pending' }
    | { status: 'error' }
    | { status: 'success'; data: InfrastructureCostsResponse }
): CostsView {
  if (query.status === 'pending') return { kind: 'loading' };
  if (query.status === 'error') return { kind: 'error' };
  const response = query.data;
  const day = response.lastCompleteDay;
  const rows = section<InfrastructureCostDay[], DailyCostRow[]>(
    response.daily,
    (data) =>
      data.map((row: InfrastructureCostDay) => ({
        ...row,
        listUsd: row.listUsd ?? 0,
      }))
  );
  const coverage = section<InfrastructureCostCollection[], CostCoverageData>(
    response.collection,
    (collected) => ({
      collected,
      missing: INVENTORY_PROVIDERS.filter(
        (provider) =>
          !collected.some(
            (entry: InfrastructureCostCollection) => entry.provider === provider
          )
      ),
    })
  );

  const anyVerifiedDay =
    response.completeDays.status === 'ok' &&
    response.completeDays.data.some(
      (entry: InfrastructureCostCompleteDays) => entry.days.length > 0
    );
  // A verified zero-spend window is data, so only show the empty state when
  // completion data confirms nothing was collected and nothing was invoiced
  // or recorded.
  const nothing =
    response.completeDays.status === 'ok' &&
    !anyVerifiedDay &&
    rows.kind === 'ok' &&
    rows.data.length === 0 &&
    response.invoices.status === 'ok' &&
    response.invoices.data.length === 0 &&
    response.recorded.status === 'ok' &&
    response.recorded.data.length === 0;
  if (nothing) return { coverage, kind: 'empty' };

  const completeDays: ReadonlyMap<string, ReadonlySet<string>> | undefined =
    response.completeDays.status === 'ok'
      ? new Map<string, ReadonlySet<string>>(
          response.completeDays.data.map(
            (entry: InfrastructureCostCompleteDays) =>
              [entry.provider, new Set(entry.days)] as const
          )
        )
      : undefined;
  const window: CostWindow = {
    completeDays,
    lastCompleteDay: day,
    month: response.reportingMonth,
  };

  const overview: Section<CostOverview> =
    rows.kind === 'ok'
      ? {
          data: (() => {
            const forecasts = forecastMonth(rows.data, window, 'provider');
            const totals = forecasts.reduce(
              (sum, entry) => ({
                forecastUsd: sum.forecastUsd + entry.forecastUsd,
                previousMonthUsd: sum.previousMonthUsd + entry.previousMonthUsd,
                toDateUsd: sum.toDateUsd + entry.toDateUsd,
              }),
              { forecastUsd: 0, previousMonthUsd: 0, toDateUsd: 0 }
            );
            const users = response.monthlyActiveUsers;
            const trailing = trailingBilled(rows.data, day, 30);
            // Every provider with rows or completed days must cover each
            // period; otherwise that total is labeled partial.
            const providers = new Set([
              ...forecasts.map((entry) => entry.key),
              ...(completeDays?.keys() ?? []),
            ]);
            const coverage = [...providers].map((provider) =>
              periodCoverage(window, provider)
            );
            // The per-user ratio needs verified days in its own 30-day window.
            const ratioCoverage = [...providers].map((provider) =>
              trailingCoverage(window, provider, 30)
            );
            const ratioMeasured = ratioCoverage.some((entry) => entry.any);
            // Forecast inputs are month to date, the run-rate window and
            // last month; a gap in any of them leaves the forecast partial,
            // even when no charge rows exist to classify.
            const rateCoverage = [...providers].map((provider) =>
              trailingCoverage(window, provider, RUN_RATE_DAYS)
            );
            return {
              ...totals,
              verificationUnavailable: !completeDays,
              measured: {
                // The forecast rests on month to date, the run-rate window
                // or last month.
                forecast:
                  coverage.some(
                    (entry) => entry.anyToDate || entry.anyPrevious
                  ) || rateCoverage.some((entry) => entry.any),
                previous: coverage.some((entry) => entry.anyPrevious),
                toDate: coverage.some((entry) => entry.anyToDate),
              },
              partial: {
                forecast:
                  !completeDays ||
                  providers.size === 0 ||
                  forecasts.some((entry) => entry.incomplete) ||
                  coverage.some((entry) => !entry.toDate || !entry.previous) ||
                  rateCoverage.some((entry) => !entry.all),
                previous:
                  !completeDays || coverage.some((entry) => !entry.previous),
                perUser: ratioCoverage.some((entry) => !entry.all),
                toDate:
                  !completeDays || coverage.some((entry) => !entry.toDate),
              },
              month: window.month,
              spendPerActiveUserUsd:
                users.status === 'ok'
                  ? {
                      data:
                        users.data > 0 && ratioMeasured
                          ? trailing / users.data
                          : null,
                      kind: 'ok',
                    }
                  : { kind: 'unavailable' },
            };
          })(),
          kind: 'ok',
        }
      : { kind: 'unavailable' };

  return {
    anomalies:
      rows.kind === 'ok'
        ? { data: detectAnomalies(rows.data, window), kind: 'ok' }
        : { kind: 'unavailable' },
    // Without completion data no breakdown amount can be qualified.
    breakdown:
      rows.kind === 'ok' && completeDays
        ? {
            data: {
              app: forecastMonth(rows.data, window, 'app'),
              environment: forecastMonth(rows.data, window, 'environment'),
              provider: forecastMonth(rows.data, window, 'provider'),
            },
            kind: 'ok',
          }
        : { kind: 'unavailable' },
    coverage,
    daily: rows,
    invoices: section<InfrastructureCostInvoice[], InfrastructureCostInvoice[]>(
      response.invoices,
      (data) => data
    ),
    kind: 'ready',
    lastCompleteDay: day,
    overview,
    recorded: section<
      InfrastructureRecordedCost[],
      InfrastructureRecordedCost[]
    >(response.recorded, (data) => data),
    rootWorkspaceId: response.rootWorkspaceId,
  };
}

/** Daily billed totals per provider for the trend chart, oldest first. */
export function dailyByProvider(rows: readonly DailyCostRow[]) {
  const providers = [...new Set(rows.map((row) => row.provider))].sort();
  const days = new Map<string, Record<string, number>>();
  for (const row of rows) {
    const entry = days.get(row.day) ?? {};
    entry[row.provider] = (entry[row.provider] ?? 0) + row.billedUsd;
    days.set(row.day, entry);
  }
  return {
    points: [...days.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, values]) => ({ day, ...values })),
    providers,
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

/**
 * The Finance transaction page an invoice posted to, or null if unposted.
 * `financeBaseUrl` may carry a mount path such as `https://tuturuuu.com/finance`.
 */
export function financeTransactionUrl(
  financeBaseUrl: string,
  rootWorkspaceId: string,
  transactionId: string | null
) {
  if (
    !transactionId ||
    !UUID.test(transactionId) ||
    !UUID.test(rootWorkspaceId)
  )
    return null;
  try {
    const base = new URL(financeBaseUrl);
    if (base.protocol !== 'https:' && base.protocol !== 'http:') return null;
    return joinAppUrl(
      `${base.origin}${base.pathname}`,
      `/${rootWorkspaceId}/transactions/${transactionId}`
    );
  } catch {
    return null;
  }
}
