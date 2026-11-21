import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getRedis: vi.fn(),
  redis: { expire: vi.fn(), get: vi.fn(), incr: vi.fn(), set: vi.fn() },
}));

vi.mock('../../upstash-rest', () => ({
  getUpstashRestRedisClient: () => mocks.getRedis(),
}));

import {
  CLOUDFLARE_IPV4_RANGES,
  CLOUDFLARE_IPV6_RANGES,
  isCloudflareIp,
} from '../cloudflare-ip-ranges';
import {
  blockIPEdge,
  clearEdgeAbuseProtectionControlsCache,
  isIPBlockedEdge,
  recordMalformedAuthCookieEdge,
  recordSuspiciousApiRequestEdge,
} from '../edge';

describe('Cloudflare IP ranges', () => {
  it('pins the published ips-v4 and ips-v6 lists', () => {
    expect([...CLOUDFLARE_IPV4_RANGES]).toEqual([
      '173.245.48.0/20',
      '103.21.244.0/22',
      '103.22.200.0/22',
      '103.31.4.0/22',
      '141.101.64.0/18',
      '108.162.192.0/18',
      '190.93.240.0/20',
      '188.114.96.0/20',
      '197.234.240.0/22',
      '198.41.128.0/17',
      '162.158.0.0/15',
      '104.16.0.0/13',
      '104.24.0.0/14',
      '172.64.0.0/13',
      '131.0.72.0/22',
    ]);
    expect([...CLOUDFLARE_IPV6_RANGES]).toEqual([
      '2400:cb00::/32',
      '2606:4700::/32',
      '2803:f800::/32',
      '2405:b500::/32',
      '2405:8100::/32',
      '2a06:98c0::/29',
      '2c0f:f248::/32',
    ]);
  });

  it.each([
    '104.22.222.49',
    '104.16.0.0',
    '104.23.255.255',
    '104.27.255.255',
    '172.71.255.255',
    '131.0.75.255',
    '2606:4700::1',
    '2a06:98c0:3600::103',
    '2a06:98c7:ffff::1',
    '::ffff:104.22.222.49',
  ])('matches Cloudflare address %s', (ip) => {
    expect(isCloudflareIp(ip)).toBe(true);
  });

  it.each([
    '104.15.255.255',
    '104.28.0.0',
    '104.28.0.0.1',
    '131.0.76.0',
    '203.0.113.42',
    '8.8.8.8',
    '2a06:98c8::1',
    '2606:4701::1',
    '::ffff:203.0.113.42',
    'unknown',
    '',
    null,
  ])('does not match %s', (ip) => {
    expect(isCloudflareIp(ip)).toBe(false);
  });
});

describe('edge blocking never targets a Cloudflare address', () => {
  const egress = '104.22.222.49';

  beforeEach(() => {
    vi.clearAllMocks();
    clearEdgeAbuseProtectionControlsCache();
    mocks.getRedis.mockResolvedValue(mocks.redis);
    mocks.redis.incr.mockResolvedValue(1_000);
    mocks.redis.set.mockResolvedValue('OK');
    mocks.redis.get.mockImplementation(async (key: string) =>
      key.includes('blocked')
        ? JSON.stringify({
            id: 'edge:block',
            level: 4,
            reason: 'api_abuse',
            expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
            blockedAt: new Date().toISOString(),
          })
        : null
    );
  });

  it('ignores a stored block and never writes or counts one', async () => {
    expect(await isIPBlockedEdge(egress)).toBeNull();
    expect(await blockIPEdge(egress, 'api_abuse')).toBeNull();
    expect(await recordSuspiciousApiRequestEdge(egress)).toBeNull();
    expect(await recordMalformedAuthCookieEdge(egress)).toBeNull();
    expect(mocks.redis.set).not.toHaveBeenCalled();
    expect(mocks.redis.incr).not.toHaveBeenCalled();
  });

  it('still blocks a visitor address', async () => {
    expect(await isIPBlockedEdge('203.0.113.42')).not.toBeNull();
    expect(await recordSuspiciousApiRequestEdge('203.0.113.42')).not.toBeNull();
    expect(mocks.redis.set).toHaveBeenCalled();
  });
});
