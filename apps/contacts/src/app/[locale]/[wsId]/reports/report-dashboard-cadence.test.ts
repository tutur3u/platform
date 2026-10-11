import { describe, expect, it } from 'vitest';
import { resolveDashboardCadence } from './report-dashboard-cadence';
import { resolveDefaultReportView } from './report-view';

describe('central dashboard cadence compatibility', () => {
  it('preserves daily defaults and ignores retained periodic filters', () => {
    expect(
      resolveDashboardCadence(
        resolveDefaultReportView({ canViewDaily: true, canViewPeriodic: true }),
        'yearly'
      )
    ).toBe('daily');
  });
  it('preserves periodic deep links and their cadence', () => {
    expect(
      resolveDashboardCadence(
        resolveDefaultReportView({
          canViewDaily: true,
          canViewPeriodic: true,
          initialView: 'periodic',
        }),
        'quarterly'
      )
    ).toBe('quarterly');
  });
  it('allows All over periodic report records', () => {
    expect(resolveDashboardCadence('periodic', 'all')).toBe('all');
  });
});
