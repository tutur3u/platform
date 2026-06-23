export const HOLIDAYS_MANAGEMENT_QUERY_KEY = [
  'infrastructure',
  'holidays',
] as const;

export function holidaysManagementQueryKey(year?: string) {
  return year
    ? [...HOLIDAYS_MANAGEMENT_QUERY_KEY, year]
    : HOLIDAYS_MANAGEMENT_QUERY_KEY;
}
