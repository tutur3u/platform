import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  isSubscriptionMonthCoveredByInvoice as covered,
  isSubscriptionMonthPaidForGroup as paid,
  isSubscriptionRangePaidForGroup as range,
  type SubscriptionCoverageInvoice,
} from './subscription-coverage';
import { getGroupPaymentStatus, type WorkspaceUserGroup } from './utils';

const explicit: SubscriptionCoverageInvoice = {
  group_id: 'g1',
  valid_until: '2026-04-01T00:00:00Z',
  covered_months: ['2026-01-01', '2026-03-01'],
};
describe('explicit tuition coverage', () => {
  afterEach(() => vi.useRealTimers());
  it.each(['2026-01', '2026-03'])('covers recorded month %s', (month) =>
    expect(covered(month, explicit)).toBe(true)
  );
  it.each(['2025-12', '2026-02', '2026-04'])(
    'does not infer unrecorded month %s from valid_until',
    (month) => expect(covered(month, explicit)).toBe(false)
  );
  it('uses months even without a compatibility expiry', () =>
    expect(covered('2026-01', { covered_months: ['2026-01-01'] })).toBe(true));
  it('keeps null legacy coverage semantics', () => {
    const legacy = { valid_until: '2026-03-01', covered_months: null };
    expect(covered('2026-02', legacy)).toBe(true);
    expect(covered('2026-03', legacy)).toBe(false);
  });
  it('treats empty explicit coverage as empty rather than legacy', () =>
    expect(covered('2026-01', { ...explicit, covered_months: [] })).toBe(
      false
    ));
  it('isolates groups', () =>
    expect(paid('g2', '2026-01', [explicit])).toBe(false));
  it('combines separate payments without masking gaps', () => {
    const rows = [explicit, { ...explicit, covered_months: ['2026-02-01'] }];
    expect(range('g1', '2026-01', 3, [explicit])).toBe(false);
    expect(range('g1', '2026-01', 3, rows)).toBe(true);
    expect(range('g1', '2026-01', 4, rows)).toBe(false);
  });
  it('combines legacy cutoff and exact modern months', () => {
    const rows = [explicit, { group_id: 'g1', valid_until: '2026-03-01' }];
    expect(range('g1', '2026-01', 3, rows)).toBe(true);
    expect(paid('g1', '2026-04', rows)).toBe(false);
  });
  it('does not label an unpaid current-month gap active', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 1, 10));
    expect(
      getGroupPaymentStatus({ id: 'g1' } as WorkspaceUserGroup, explicit, [
        explicit,
      ])
    ).toBe('expired');
  });
  it('uses all invoices for the current-month badge', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 1, 10));
    const rows = [explicit, { ...explicit, covered_months: ['2026-02-01'] }];
    expect(
      getGroupPaymentStatus({ id: 'g1' } as WorkspaceUserGroup, explicit, rows)
    ).toBe('active');
  });
  it('expires at the next gap rather than the latest paid month', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 25));
    expect(
      getGroupPaymentStatus({ id: 'g1' } as WorkspaceUserGroup, explicit, [
        explicit,
      ])
    ).toBe('expiringSoon');
  });
});
