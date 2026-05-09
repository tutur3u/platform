export type FinancePaginationSummary = {
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  limit: number;
  offset: number;
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
};

export type FinancePaginatedResponse<T = unknown> = {
  count: number;
  data: T[];
  pagination: FinancePaginationSummary;
};

function parsePositiveInteger(value: unknown, fallback: number) {
  const parsed =
    typeof value === 'number'
      ? value
      : Number.parseInt(typeof value === 'string' ? value : '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function buildFinancePaginationSummary({
  page,
  pageSize,
  total,
}: {
  page: unknown;
  pageSize: unknown;
  total: number;
}): FinancePaginationSummary {
  const normalizedPageSize = parsePositiveInteger(pageSize, 25);
  const normalizedPage = parsePositiveInteger(page, 1);
  const offset = (normalizedPage - 1) * normalizedPageSize;
  const safeTotal = Math.max(0, total);
  const pageCount = Math.max(1, Math.ceil(safeTotal / normalizedPageSize));

  return {
    hasNextPage: offset + normalizedPageSize < safeTotal,
    hasPreviousPage: offset > 0,
    limit: normalizedPageSize,
    offset,
    page: normalizedPage,
    pageCount,
    pageSize: normalizedPageSize,
    total: safeTotal,
  };
}

export function withFinancePagination<
  T extends { count: number; data: unknown[] },
>(
  payload: T,
  query: { page?: unknown; pageSize?: unknown }
): T & FinancePaginatedResponse {
  return {
    ...payload,
    pagination:
      'pagination' in payload && payload.pagination
        ? (payload.pagination as FinancePaginationSummary)
        : buildFinancePaginationSummary({
            page: query.page,
            pageSize: query.pageSize,
            total: payload.count,
          }),
  };
}
