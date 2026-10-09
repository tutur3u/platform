import type { ReportView } from './report-view';

// Daily rows are recipients; All spans only periodic report records.
export const dashboardCadences = [
  'daily',
  'weekly',
  'monthly',
  'quarterly',
  'yearly',
  'all',
] as const;
export type DashboardCadence = (typeof dashboardCadences)[number];

export function resolveDashboardCadence(
  view: ReportView,
  periodicCadence: Exclude<DashboardCadence, 'daily'>
): DashboardCadence {
  return view === 'daily' ? 'daily' : periodicCadence;
}
