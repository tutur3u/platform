import { PERIODIC_REPORT_STAGES } from '@tuturuuu/internal-api/reports';
import {
  DELIVERY_CATEGORIES,
  periodicDeliveryCategory,
} from './report-delivery-category';

// Bound reads and memory without presenting a partial aggregate as an exact total.
export const MAX_REPORT_LIST_ROWS = 20_000;
export const REPORT_LIST_CHUNK_SIZE = 1_000;
export class ReportListLimitError extends Error {
  constructor() {
    super('Too many reports. Choose a narrower date range or search.');
  }
}
interface CountedResult<Row> {
  data: Row[] | null;
  count: number | null;
  error: unknown;
}
export async function collectReportList<Row extends { id?: unknown }>(
  fetchPage: (offset: number, limit: number) => PromiseLike<CountedResult<Row>>,
  maxRows = MAX_REPORT_LIST_ROWS
): Promise<Row[]> {
  const rows: Row[] = [];
  const ids = new Set<string>();
  let total: number | undefined;
  do {
    const result = await fetchPage(rows.length, REPORT_LIST_CHUNK_SIZE);
    if (result.error) throw result.error;
    if (
      result.count === null ||
      !Number.isSafeInteger(result.count) ||
      result.count < 0
    ) {
      throw new Error('Exact report total unavailable');
    }
    if (result.count > maxRows) throw new ReportListLimitError();
    if (total !== undefined && total !== result.count)
      throw new Error('Report scope changed. Refresh reports.');
    total = result.count;
    const page = result.data;
    if (
      !page ||
      (page.length === 0 && rows.length < total) ||
      rows.length + page.length > total
    ) {
      throw new Error('Incomplete report results');
    }
    for (const row of page) {
      if (typeof row.id !== 'string' || !row.id || ids.has(row.id)) {
        throw new Error('Report scope changed. Refresh reports.');
      }
      ids.add(row.id);
    }
    rows.push(...page);
  } while (rows.length < total);
  return rows;
}

export function sortReportList<
  Row extends { id: string | null; created_at: string | null },
  Column extends keyof Row,
>(rows: Row[], column: Column, ascending: boolean): Row[] {
  const compare = (left: unknown, right: unknown, asc: boolean) => {
    if (left === right) return 0;
    if (left === null || left === undefined) return 1;
    if (right === null || right === undefined) return -1;
    const order = String(left) < String(right) ? -1 : 1;
    return asc ? order : -order;
  };
  return rows.sort(
    (left, right) =>
      compare(left[column], right[column], ascending) ||
      compare(left.created_at, right.created_at, ascending) ||
      compare(left.id, right.id, true)
  );
}

type CountableReport = Parameters<typeof periodicDeliveryCategory>[0] & {
  report_stage?: string | null;
};
export function summarizeReportList(rows: CountableReport[]) {
  const stages = Object.fromEntries(
    PERIODIC_REPORT_STAGES.map((stage) => [stage, 0])
  ) as Record<(typeof PERIODIC_REPORT_STAGES)[number], number>;
  const categoryCounts = Object.fromEntries(
    DELIVERY_CATEGORIES.map((category) => [category, 0])
  ) as Record<(typeof DELIVERY_CATEGORIES)[number], number>;
  for (const row of rows) {
    if (
      !PERIODIC_REPORT_STAGES.includes(
        row.report_stage as (typeof PERIODIC_REPORT_STAGES)[number]
      )
    ) {
      throw new Error('Report stage unavailable');
    }
    stages[row.report_stage as (typeof PERIODIC_REPORT_STAGES)[number]]++;
    const category = periodicDeliveryCategory(row);
    if (category) categoryCounts[category]++;
  }
  return {
    categoryCounts,
    counts: {
      stages,
      total: rows.length,
      draft: stages.draft,
      pendingReview: stages.pending,
      approved: stages.approved,
      blocked: stages.blocked,
      failed: stages.failed,
      delivered: stages.sent,
    },
  };
}
