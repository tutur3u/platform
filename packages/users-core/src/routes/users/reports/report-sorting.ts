export const PERIODIC_REPORT_SORT_COLUMNS = {
  period: 'period_start',
  title: 'title',
  updated: 'updated_at',
  user: 'user_display_name',
} as const;

export type PeriodicReportSortBy = keyof typeof PERIODIC_REPORT_SORT_COLUMNS;

export function getPeriodicReportSortColumn(sortBy: PeriodicReportSortBy) {
  return PERIODIC_REPORT_SORT_COLUMNS[sortBy];
}
