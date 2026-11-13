import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { describe, expect, it } from 'vitest';
import {
  isWorkspaceDomainStaffUser,
  isWorkspaceDomainsBillingEnabled,
  readWorkspaceDomainEntitlement,
} from './entitlement';

function adminReturning(result: { data: unknown; error: unknown }) {
  return {
    schema: () => ({ rpc: async () => result }),
  } as unknown as TypedSupabaseClient;
}

const STAFF = {
  allowed: true,
  reason: 'ok',
  source: 'staff_bypass',
  cap: 10,
  used: 0,
  total: 10,
  remaining: 10,
};

describe('readWorkspaceDomainEntitlement', () => {
  it('keeps the staff bypass only for a verified staff session', async () => {
    const admin = adminReturning({ data: STAFF, error: null });
    expect(
      await readWorkspaceDomainEntitlement(admin, 'ws', {
        id: 'u',
        staffSession: true,
      })
    ).toMatchObject({ allowed: true, source: 'staff_bypass' });
    expect(
      await readWorkspaceDomainEntitlement(admin, 'ws', {
        id: 'u',
        staffSession: false,
      })
    ).toMatchObject({
      allowed: false,
      source: null,
      reason: 'staff_session_unverified',
    });
  });

  it('fails closed on errors and unexpected shapes', async () => {
    const actor = { id: 'u', staffSession: true };
    expect(
      await readWorkspaceDomainEntitlement(
        adminReturning({ data: null, error: { code: '42501' } }),
        'ws',
        actor
      )
    ).toMatchObject({ allowed: false, reason: 'unavailable' });
    expect(
      await readWorkspaceDomainEntitlement(
        adminReturning({ data: { allowed: true }, error: null }),
        'ws',
        actor
      )
    ).toMatchObject({ allowed: false, reason: 'unavailable' });
  });
});

describe('isWorkspaceDomainsBillingEnabled', () => {
  it('is off unless enabled with a product id', () => {
    expect(isWorkspaceDomainsBillingEnabled({})).toBe(false);
    expect(
      isWorkspaceDomainsBillingEnabled({
        WORKSPACE_DOMAINS_BILLING_ENABLED: '1',
      })
    ).toBe(false);
    expect(
      isWorkspaceDomainsBillingEnabled({
        WORKSPACE_DOMAINS_BILLING_ENABLED: 'true',
      })
    ).toBe(false);
    expect(
      isWorkspaceDomainsBillingEnabled({
        WORKSPACE_DOMAINS_BILLING_ENABLED: 'true',
        WORKSPACE_DOMAINS_POLAR_PRODUCT_ID: 'prod_123',
      })
    ).toBe(true);
  });
});

describe('isWorkspaceDomainStaffUser', () => {
  const user = (email: string, confirmed = true) => ({
    email,
    email_confirmed_at: confirmed ? '2026-01-01T00:00:00Z' : null,
    identities: [{ provider: 'email', identity_data: {} }],
  });

  it('accepts only confirmed emails in exactly @tuturuuu.com', () => {
    expect(isWorkspaceDomainStaffUser(user('staff@tuturuuu.com'))).toBe(true);
    for (const email of [
      'staff@xwf.tuturuuu.com',
      'staff@tuturuuu.com.evil.com',
      'staff@eviltuturuuu.com',
      'staff@tuturuuu.co',
      'tuturuuu.com@example.com',
    ]) {
      expect(isWorkspaceDomainStaffUser(user(email))).toBe(false);
    }
    expect(isWorkspaceDomainStaffUser(user('staff@tuturuuu.com', false))).toBe(
      false
    );
    expect(isWorkspaceDomainStaffUser(null)).toBe(false);
  });
});
