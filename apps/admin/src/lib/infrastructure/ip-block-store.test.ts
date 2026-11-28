import { describe, expect, it, vi } from 'vitest';

vi.mock('@tuturuuu/utils/abuse-protection', () => ({
  REDIS_KEYS: { IP_BLOCKED: (ip: string) => `ip:blocked:${ip}` },
}));
vi.mock('@tuturuuu/utils/abuse-protection/edge', () => ({
  getEdgeRedisClient: () => null,
}));
vi.mock('@tuturuuu/utils/upstash-rest', () => ({
  getUpstashRestRedisClient: () => null,
}));

import { blockedIpSearchFilter } from './ip-block-store';

describe('blocked IP page search', () => {
  it('uses the text IP predicate without applying ILIKE to the reason enum', () => {
    expect(blockedIpSearchFilter('203.0.113')).toBe(
      'ip_address.ilike.%203.0.113%'
    );
    expect(blockedIpSearchFilter('2001:db8::1')).toBe(
      'ip_address.ilike.%2001:db8::1%'
    );
    expect(blockedIpSearchFilter('otp_send')).toBe(
      'ip_address.ilike.%otp\\_send%,reason.in.(otp_send)'
    );
  });

  it('rejects embedded PostgREST expressions', () => {
    expect(blockedIpSearchFilter('203.0.113,reason.eq.manual')).toBeNull();
  });
});
