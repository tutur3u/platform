// Monthly rollups, forecasts and anomaly flags over collected provider-day
// lines. Amounts are API-reported charges: provisional until an invoice for
// the month reconciles them.

export interface DailyCostRow {
  readonly day: string;
  readonly provider: string;
  readonly service: string;
  readonly app: string;
  readonly environment: string;
  readonly listUsd: number;
  readonly billedUsd: number;
}

export type CostDimension = 'provider' | 'app' | 'environment';

/**
 * The reporting month and data cutoff. `completeDays` lists, per provider,
 * the days whose collection completed; a completed day without rows is a
 * measured zero. Without it, a day with rows counts as complete.
 */
export interface CostWindow {
  readonly month: string;
  readonly lastCompleteDay: string;
  readonly completeDays?: ReadonlyMap<string, ReadonlySet<string>>;
}

export interface MonthTotal {
  readonly month: string;
  readonly key: string;
  readonly listUsd: number;
  readonly billedUsd: number;
}

export interface MonthForecast {
  readonly key: string;
  readonly month: string;
  readonly toDateUsd: number;
  readonly forecastUsd: number;
  readonly previousMonthUsd: number;
  /** Some month-to-date day was not collected. */
  readonly partialToDate: boolean;
  /** Some day of the previous month was not collected. */
  readonly partialPrevious: boolean;
  /** At least one day of the period was collected for this key. */
  readonly measuredToDate: boolean;
  readonly measuredPrevious: boolean;
  /** At least one forecast input day (month to date, the run-rate window or
   * last month) was collected for this key. */
  readonly measuredForecast: boolean;
  /** The forecast rests on a partial input: month to date, the run-rate
   * window, or a previous-month amount it carries forward. */
  readonly incomplete: boolean;
}

export type CostAnomaly =
  | {
      readonly kind: 'daily-spike';
      readonly provider: string;
      readonly day: string;
      readonly billedUsd: number;
      readonly baselineUsd: number;
    }
  | {
      readonly kind: 'month-growth';
      readonly provider: string;
      readonly month: string;
      readonly forecastUsd: number;
      readonly previousMonthUsd: number;
    };

// A service charged on fewer days than this in the trailing window is treated
// as a fixed charge (a plan fee or seat) and is not extrapolated.
export const VARIABLE_SERVICE_MIN_DAYS = 3;
export const RUN_RATE_DAYS = 7;
export const SPIKE_BASELINE_DAYS = 14;
export const SPIKE_MULTIPLIER = 3;
export const SPIKE_MIN_USD = 1;
export const GROWTH_MULTIPLIER = 1.5;
export const GROWTH_MIN_DELTA_USD = 5;

const monthOf = (day: string) => day.slice(0, 7);

export function addDays(day: string, offset: number) {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function previousMonth(month: string) {
  const date = new Date(`${month}-01T00:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() - 1);
  return date.toISOString().slice(0, 7);
}

function lastDayOf(month: string) {
  const date = new Date(`${month}-01T00:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() + 1);
  date.setUTCDate(0);
  return date.toISOString().slice(0, 10);
}

function keyOf(row: DailyCostRow, dimension: CostDimension) {
  if (dimension === 'provider') return row.provider;
  if (dimension === 'app') return row.app || 'shared';
  return row.environment || 'shared';
}

function isComplete(
  window: CostWindow,
  rowsByProviderDay: ReadonlySet<string>,
  provider: string,
  day: string
) {
  return window.completeDays
    ? window.completeDays.get(provider)?.has(day) === true
    : rowsByProviderDay.has(`${provider}|${day}`);
}

export function monthlyTotals(
  rows: readonly DailyCostRow[],
  dimension: CostDimension
): MonthTotal[] {
  const totals = new Map<string, { list: number; billed: number }>();
  for (const row of rows) {
    const id = JSON.stringify([monthOf(row.day), keyOf(row, dimension)]);
    const total = totals.get(id) ?? { list: 0, billed: 0 };
    total.list += row.listUsd;
    total.billed += row.billedUsd;
    totals.set(id, total);
  }
  return [...totals.entries()]
    .map(([id, total]) => {
      const [month, key] = JSON.parse(id) as [string, string];
      return { billedUsd: total.billed, key, listUsd: total.list, month };
    })
    .sort((a, b) =>
      a.month === b.month
        ? b.billedUsd - a.billedUsd || a.key.localeCompare(b.key)
        : a.month.localeCompare(b.month)
    );
}

/**
 * Forecasts the billed total of `window.month` per dimension key.
 *
 * Services are classified once, per provider and service, so every
 * dimension rolls up the same projection. A variable service extrapolates
 * its average over the collected days of the last seven to the days left in
 * the month. A fixed charge is projected per service, app and environment:
 * it keeps its month-to-date amount once charged this month (even when a
 * credit nets it to zero), or last month's amount before that. A closed
 * month forecasts its actuals.
 */
export function forecastMonth(
  rows: readonly DailyCostRow[],
  window: CostWindow,
  dimension: CostDimension = 'provider'
): MonthForecast[] {
  const { month } = window;
  const prior = previousMonth(month);
  const monthStart = `${month}-01`;
  const monthEnd = lastDayOf(month);
  const cutoff =
    window.lastCompleteDay < monthEnd ? window.lastCompleteDay : monthEnd;
  const elapsed = cutoff < monthStart ? 0 : Number(cutoff.slice(8, 10));
  const remaining = Number(monthEnd.slice(8, 10)) - elapsed;
  const classStart = addDays(cutoff, -(SPIKE_BASELINE_DAYS - 1));
  const rateStart = addDays(cutoff, -(RUN_RATE_DAYS - 1));

  const rowDays = new Set(rows.map((row) => `${row.provider}|${row.day}`));
  const rateDays = new Map<string, number>();
  const collectedRateDays = (provider: string) => {
    const known = rateDays.get(provider);
    if (known !== undefined) return known;
    let count = 0;
    for (let offset = 0; offset < RUN_RATE_DAYS; offset += 1)
      if (isComplete(window, rowDays, provider, addDays(rateStart, offset)))
        count += 1;
    rateDays.set(provider, count);
    return count;
  };

  interface ServiceState {
    chargedDays: Set<string>;
  }
  interface GroupState {
    key: string;
    provider: string;
    serviceId: string;
    occurred: boolean;
    toDate: number;
    previous: number;
    rateTotal: number;
  }
  const services = new Map<string, ServiceState>();
  const groups = new Map<string, GroupState>();
  for (const row of rows) {
    if (row.day > cutoff && monthOf(row.day) !== prior) continue;
    const serviceId = JSON.stringify([row.provider, row.service]);
    const service = services.get(serviceId) ?? {
      chargedDays: new Set<string>(),
    };
    const rowMonth = monthOf(row.day);
    // Run-rate inputs use only completed days, the same days the divisor
    // counts, so a partially collected day cannot skew the rate.
    const completeDay = isComplete(window, rowDays, row.provider, row.day);
    if (
      completeDay &&
      row.day >= classStart &&
      row.day <= cutoff &&
      row.billedUsd !== 0
    )
      service.chargedDays.add(row.day);
    services.set(serviceId, service);

    const groupId = JSON.stringify([
      serviceId,
      row.app,
      row.environment,
      keyOf(row, dimension),
    ]);
    const group = groups.get(groupId) ?? {
      key: keyOf(row, dimension),
      occurred: false,
      previous: 0,
      provider: row.provider,
      rateTotal: 0,
      serviceId,
      toDate: 0,
    };
    if (rowMonth === month && row.day <= cutoff) {
      group.toDate += row.billedUsd;
      group.occurred = true;
    }
    if (rowMonth === prior) group.previous += row.billedUsd;
    if (completeDay && row.day >= rateStart && row.day <= cutoff)
      group.rateTotal += row.billedUsd;
    groups.set(groupId, group);
  }

  interface Coverage {
    toDate: boolean;
    previous: boolean;
    anyToDate: boolean;
    anyPrevious: boolean;
  }
  const coverage = new Map<string, Coverage>();
  const providerCoverage = (provider: string) => {
    const known = coverage.get(provider);
    if (known) return known;
    // Counts the verified days in a range: all of them, or at least one.
    const scan = (start: string, end: string) => {
      let all = true;
      let any = false;
      for (let cursor = start; cursor <= end; cursor = addDays(cursor, 1))
        if (isComplete(window, rowDays, provider, cursor)) any = true;
        else all = false;
      return { all, any };
    };
    const previous = scan(`${prior}-01`, lastDayOf(prior));
    const toDate =
      // A month with no elapsed day is fully covered but has no verified day.
      elapsed === 0 ? { all: true, any: false } : scan(monthStart, cutoff);
    const result: Coverage = {
      anyPrevious: previous.any,
      anyToDate: toDate.any,
      previous: previous.all,
      toDate: toDate.all,
    };
    coverage.set(provider, result);
    return result;
  };

  const totals = new Map<
    string,
    {
      toDate: number;
      forecast: number;
      previous: number;
      incomplete: boolean;
      partialToDate: boolean;
      partialPrevious: boolean;
      measuredToDate: boolean;
      measuredPrevious: boolean;
      measuredForecast: boolean;
    }
  >();
  for (const group of groups.values()) {
    const service = services.get(group.serviceId)!;
    const collected = collectedRateDays(group.provider);
    const variable = service.chargedDays.size >= VARIABLE_SERVICE_MIN_DAYS;
    const covered = providerCoverage(group.provider);
    let projected = group.toDate;
    let carriesPrevious = false;
    if (remaining > 0) {
      if (variable)
        projected =
          group.toDate +
          (collected > 0 ? group.rateTotal / collected : 0) * remaining;
      else if (!group.occurred) {
        projected = group.previous;
        carriesPrevious = true;
      }
    }
    const total = totals.get(group.key) ?? {
      forecast: 0,
      incomplete: false,
      measuredForecast: false,
      measuredPrevious: false,
      measuredToDate: false,
      partialPrevious: false,
      partialToDate: false,
      previous: 0,
      toDate: 0,
    };
    total.toDate += group.toDate;
    total.forecast += projected;
    total.previous += group.previous;
    if (!covered.toDate) total.partialToDate = true;
    if (!covered.previous) total.partialPrevious = true;
    if (covered.anyToDate) total.measuredToDate = true;
    if (covered.anyPrevious) total.measuredPrevious = true;
    if (covered.anyToDate || covered.anyPrevious || collected > 0)
      total.measuredForecast = true;
    if (
      !covered.toDate ||
      (remaining > 0 && variable && collected < RUN_RATE_DAYS) ||
      (carriesPrevious && !covered.previous)
    )
      total.incomplete = true;
    totals.set(group.key, total);
  }
  return [...totals.entries()]
    .map(([key, total]) => ({
      forecastUsd: total.forecast,
      incomplete: total.incomplete,
      key,
      month,
      measuredPrevious: total.measuredPrevious,
      measuredForecast: total.measuredForecast,
      measuredToDate: total.measuredToDate,
      partialPrevious: total.partialPrevious,
      partialToDate: total.partialToDate,
      previousMonthUsd: total.previous,
      toDateUsd: total.toDate,
    }))
    .sort(
      (a, b) => b.forecastUsd - a.forecastUsd || a.key.localeCompare(b.key)
    );
}

/**
 * Whether every day of this month to date and of the previous month was
 * collected for a provider. Without completion data nothing is verified.
 */
/**
 * Verified days for a provider in the `days` complete days ending at
 * `lastCompleteDay`: whether all of them and whether any of them completed.
 */
export function trailingCoverage(
  window: CostWindow,
  provider: string,
  days: number
) {
  const set = window.completeDays?.get(provider);
  let all = true;
  let any = false;
  for (let offset = 0; offset < days; offset += 1)
    if (set?.has(addDays(window.lastCompleteDay, -offset))) any = true;
    else all = false;
  return { all, any };
}

export function periodCoverage(window: CostWindow, provider: string) {
  const days = window.completeDays?.get(provider);
  const monthStart = `${window.month}-01`;
  const monthEnd = lastDayOf(window.month);
  const cutoff =
    window.lastCompleteDay < monthEnd ? window.lastCompleteDay : monthEnd;
  const prior = previousMonth(window.month);
  const scan = (start: string, end: string) => {
    let all = !!days;
    let any = false;
    for (let cursor = start; cursor <= end; cursor = addDays(cursor, 1))
      if (days?.has(cursor)) any = true;
      else all = false;
    return { all, any };
  };
  const previous = scan(`${prior}-01`, lastDayOf(prior));
  const toDate =
    cutoff < monthStart ? { all: true, any: false } : scan(monthStart, cutoff);
  return {
    anyPrevious: previous.any,
    anyToDate: toDate.any,
    previous: previous.all,
    toDate: toDate.all,
  };
}

function median(values: number[]) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]!
    : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

/**
 * Flags a provider's last complete day billed above `SPIKE_MULTIPLIER` times
 * the median of its collected baseline days (a collected day without rows
 * counts as zero), and a month forecast above `GROWTH_MULTIPLIER` times the
 * previous month when both months are fully collected. Small absolute
 * changes are ignored.
 */
export function detectAnomalies(
  rows: readonly DailyCostRow[],
  window: CostWindow
): CostAnomaly[] {
  const day = window.lastCompleteDay;
  const rowDays = new Set(rows.map((row) => `${row.provider}|${row.day}`));
  const byProviderDay = new Map<string, Map<string, number>>();
  for (const row of rows) {
    const days = byProviderDay.get(row.provider) ?? new Map<string, number>();
    days.set(row.day, (days.get(row.day) ?? 0) + row.billedUsd);
    byProviderDay.set(row.provider, days);
  }
  const providers = new Set([
    ...byProviderDay.keys(),
    ...(window.completeDays?.keys() ?? []),
  ]);

  const anomalies: CostAnomaly[] = [];
  for (const provider of [...providers].sort()) {
    if (!isComplete(window, rowDays, provider, day)) continue;
    const days = byProviderDay.get(provider) ?? new Map<string, number>();
    const baseline = Array.from({ length: SPIKE_BASELINE_DAYS }, (_, index) =>
      addDays(day, -1 - index)
    )
      .filter((baselineDay) =>
        isComplete(window, rowDays, provider, baselineDay)
      )
      .map((baselineDay) => days.get(baselineDay) ?? 0);
    if (baseline.length < VARIABLE_SERVICE_MIN_DAYS) continue;
    const billedUsd = days.get(day) ?? 0;
    const baselineUsd = median(baseline);
    if (
      billedUsd >= SPIKE_MIN_USD &&
      billedUsd > Math.max(baselineUsd, 0) * SPIKE_MULTIPLIER
    )
      anomalies.push({
        baselineUsd,
        billedUsd,
        day,
        kind: 'daily-spike',
        provider,
      });
  }

  // Month growth compares two totals, so both periods must be verifiably
  // collected: every day of the previous month and of this month so far.
  if (!window.completeDays) return anomalies;
  const monthStart = `${window.month}-01`;
  const priorStart = `${previousMonth(window.month)}-01`;
  const covered = (provider: string) => {
    const days = window.completeDays?.get(provider);
    if (!days) return false;
    for (let cursor = priorStart; cursor <= day; cursor = addDays(cursor, 1))
      if (cursor < monthStart || cursor.slice(0, 7) === window.month)
        if (!days.has(cursor)) return false;
    return true;
  };
  for (const forecast of forecastMonth(rows, window, 'provider')) {
    if (
      !forecast.incomplete &&
      covered(forecast.key) &&
      forecast.previousMonthUsd > 0 &&
      forecast.forecastUsd > forecast.previousMonthUsd * GROWTH_MULTIPLIER &&
      forecast.forecastUsd - forecast.previousMonthUsd >= GROWTH_MIN_DELTA_USD
    )
      anomalies.push({
        forecastUsd: forecast.forecastUsd,
        kind: 'month-growth',
        month: forecast.month,
        previousMonthUsd: forecast.previousMonthUsd,
        provider: forecast.key,
      });
  }
  return anomalies;
}

/** Billed total over the `days` complete days ending at `lastCompleteDay`. */
export function trailingBilled(
  rows: readonly DailyCostRow[],
  lastCompleteDay: string,
  days: number
) {
  const start = addDays(lastCompleteDay, -(days - 1));
  let total = 0;
  for (const row of rows)
    if (row.day >= start && row.day <= lastCompleteDay) total += row.billedUsd;
  return total;
}
