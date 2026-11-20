import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { describe, expect, it } from 'vitest';
import {
  isMiraPaidTier,
  isMiraPaidTierEnabled,
  miraBillingWorkspaceId,
  miraPayerMatchesBilling,
  newestActiveSubscriptionTier,
} from './mira-entitlement';

const PERSONAL = '11111111-1111-4111-8111-111111111111';

describe('Mira entitlement', () => {
  it('accepts only Plus, Pro and Enterprise behind the exact hosting switch', () => {
    for (const tier of ['PLUS', 'PRO', 'ENTERPRISE'])
      expect(isMiraPaidTier(tier)).toBe(true);
    for (const tier of ['FREE', 'plus', '', null, undefined])
      expect(isMiraPaidTier(tier)).toBe(false);
    expect(isMiraPaidTierEnabled('true')).toBe(true);
    for (const value of ['TRUE', '1', 'yes', '', undefined, true])
      expect(isMiraPaidTierEnabled(value)).toBe(false);
  });

  it('uses the newest active subscription and fails closed on a missing product tier', () => {
    const tiers = new Map([
      ['old', 'PRO'],
      ['new', 'FREE'],
    ]);
    expect(
      newestActiveSubscriptionTier(
        [
          { created_at: '2026-01-01', status: 'active', product_id: 'old' },
          { created_at: '2026-06-01', status: 'active', product_id: 'new' },
          { created_at: '2026-09-01', status: 'canceled', product_id: 'old' },
        ],
        tiers
      )
    ).toBe('FREE');
    expect(newestActiveSubscriptionTier([], tiers)).toBe('FREE');
    expect(() =>
      newestActiveSubscriptionTier(
        [{ created_at: '2026-01-01', status: 'active', product_id: 'gone' }],
        tiers
      )
    ).toThrow();
  });

  it('drains the root workspace only for staff and keeps the payer bound to billing', () => {
    expect(miraBillingWorkspaceId('tuturuuu', PERSONAL)).toBe(
      ROOT_WORKSPACE_ID
    );
    expect(miraBillingWorkspaceId('account', PERSONAL)).toBe(PERSONAL);
    expect(miraPayerMatchesBilling('tuturuuu', ROOT_WORKSPACE_ID)).toBe(true);
    expect(miraPayerMatchesBilling('tuturuuu', PERSONAL)).toBe(false);
    expect(miraPayerMatchesBilling('account', PERSONAL)).toBe(true);
    expect(miraPayerMatchesBilling('account', ROOT_WORKSPACE_ID)).toBe(false);
    expect(miraPayerMatchesBilling('account', undefined)).toBe(false);
  });
});
