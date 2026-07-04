import { describe, expect, it } from 'vitest';
import {
  BlockedIpSearchParamsSchema,
  shouldApplyBlockedIpStatusFilter,
} from './search-params';

describe('blocked IP search params', () => {
  it('defaults to all statuses when status is absent', () => {
    const parsed = BlockedIpSearchParamsSchema.parse({});

    expect(parsed).toMatchObject({
      page: 1,
      pageSize: 10,
      q: '',
      status: '',
    });
    expect(shouldApplyBlockedIpStatusFilter(parsed.status)).toBe(false);
  });

  it('keeps an explicit active status filter', () => {
    const parsed = BlockedIpSearchParamsSchema.parse({
      page: '2',
      pageSize: '100',
      q: '203.0.113',
      status: 'active',
    });

    expect(parsed).toMatchObject({
      page: 2,
      pageSize: 100,
      q: '203.0.113',
      status: 'active',
    });
    expect(shouldApplyBlockedIpStatusFilter(parsed.status)).toBe(true);
  });

  it('falls back to all statuses for invalid status values', () => {
    const parsed = BlockedIpSearchParamsSchema.parse({
      q: 'password_login_failed',
      status: 'unknown',
    });

    expect(parsed.q).toBe('password_login_failed');
    expect(parsed.status).toBe('');
    expect(shouldApplyBlockedIpStatusFilter(parsed.status)).toBe(false);
  });
});
