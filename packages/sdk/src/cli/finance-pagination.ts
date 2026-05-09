import type { FlagValue } from './args';

export type FinancePagination = {
  limit: number;
  offset: number;
  page: number;
  pageSize: number;
};

export type FinancePaginationSummary = FinancePagination & {
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  pageCount: number;
  total: number;
};

const DEFAULT_FINANCE_PAGE_SIZE = 25;

function getFlagValue(flags: Record<string, FlagValue>, name: string) {
  const value = flags[name];
  if (Array.isArray(value)) return value[0];
  return value;
}

function parsePositiveInteger(value: FlagValue | undefined) {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function parseNonNegativeInteger(value: FlagValue | undefined) {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

export function getFinancePagination(flags: Record<string, FlagValue>) {
  const pageSize =
    parsePositiveInteger(getFlagValue(flags, 'items-per-page')) ??
    parsePositiveInteger(getFlagValue(flags, 'page-size')) ??
    parsePositiveInteger(getFlagValue(flags, 'limit')) ??
    DEFAULT_FINANCE_PAGE_SIZE;
  const page = parsePositiveInteger(getFlagValue(flags, 'page'));
  const offset =
    page === undefined
      ? (parseNonNegativeInteger(getFlagValue(flags, 'offset')) ?? 0)
      : (page - 1) * pageSize;
  const normalizedPage = Math.floor(offset / pageSize) + 1;

  return {
    limit: pageSize,
    offset,
    page: normalizedPage,
    pageSize,
  };
}

export function getFinancePaginationSummary(
  pagination: FinancePagination,
  total: number
): FinancePaginationSummary {
  const safeTotal = Math.max(0, total);
  const pageCount = Math.max(1, Math.ceil(safeTotal / pagination.pageSize));

  return {
    ...pagination,
    hasNextPage: pagination.offset + pagination.pageSize < safeTotal,
    hasPreviousPage: pagination.offset > 0,
    pageCount,
    total: safeTotal,
  };
}

export function paginateFinanceArray<T>(
  data: T[],
  flags: Record<string, FlagValue>
) {
  const pagination = getFinancePagination(flags);
  const rows = data.slice(
    pagination.offset,
    pagination.offset + pagination.pageSize
  );

  return {
    count: data.length,
    data: rows,
    pagination: getFinancePaginationSummary(pagination, data.length),
  };
}
