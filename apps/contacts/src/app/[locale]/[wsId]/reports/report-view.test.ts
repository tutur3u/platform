import { describe, expect, it } from 'vitest';
import { resolveDefaultReportView } from './report-view';

describe('resolveDefaultReportView', () => {
  it('opens the daily reports view by default', () => {
    expect(
      resolveDefaultReportView({
        canViewDaily: true,
        canViewPeriodic: true,
      })
    ).toBe('daily');
  });

  it('preserves an explicit periodic deep link', () => {
    expect(
      resolveDefaultReportView({
        canViewDaily: true,
        canViewPeriodic: true,
        initialView: 'periodic',
      })
    ).toBe('periodic');
  });

  it('falls back to periodic when daily reports are not permitted', () => {
    expect(
      resolveDefaultReportView({
        canViewDaily: false,
        canViewPeriodic: true,
      })
    ).toBe('periodic');
  });
});
