export const reportViews = ['daily', 'periodic', 'automations'] as const;
export type ReportView = (typeof reportViews)[number];

export function resolveDefaultReportView({
  canViewDaily,
  canViewPeriodic,
  initialView,
}: {
  canViewDaily: boolean;
  canViewPeriodic: boolean;
  initialView?: string;
}): ReportView {
  if (initialView === 'daily' && canViewDaily) return 'daily';
  if (initialView === 'automations' && canViewPeriodic) return 'automations';
  if (initialView === 'periodic' && canViewPeriodic) return 'periodic';
  if (canViewDaily) return 'daily';
  return 'periodic';
}
