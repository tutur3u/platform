export interface PeriodicReportCountsRpcRow {
  approved: number | null;
  blocked: number | null;
  delivered: number | null;
  draft: number | null;
  failed: number | null;
  pending_review: number | null;
  total: number | null;
}

export function normalizePeriodicReportCounts(
  row?: PeriodicReportCountsRpcRow | null
) {
  return {
    approved: Number(row?.approved ?? 0),
    blocked: Number(row?.blocked ?? 0),
    delivered: Number(row?.delivered ?? 0),
    draft: Number(row?.draft ?? 0),
    failed: Number(row?.failed ?? 0),
    pendingReview: Number(row?.pending_review ?? 0),
    total: Number(row?.total ?? 0),
  };
}
