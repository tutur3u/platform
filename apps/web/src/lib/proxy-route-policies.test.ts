import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import {
  FLEET_PUBLISHER_ROUTE_POLICY,
  isSignedFleetPublish,
  webProxyRoutePolicies,
} from './proxy-route-policies';

const SIGNATURE = 'a'.repeat(64);

function request(path: string, method: string, signature?: string) {
  return new NextRequest(`https://tuturuuu.com${path}`, {
    method,
    headers: signature ? { 'x-mm-signature': signature } : {},
  });
}

describe('fleet publisher proxy policy', () => {
  it.each(['/api/v1/mastermind/fleet/state', '/api/v1/mastermind/fleet/usage'])(
    'selects signed PUTs to %s',
    (path) => {
      expect(isSignedFleetPublish(request(path, 'PUT', SIGNATURE))).toBe(true);
    }
  );

  it.each([
    ['an unsigned PUT', '/api/v1/mastermind/fleet/state', 'PUT', undefined],
    ['uppercase hex', '/api/v1/mastermind/fleet/state', 'PUT', 'A'.repeat(64)],
    [
      'a short signature',
      '/api/v1/mastermind/fleet/state',
      'PUT',
      'a'.repeat(63),
    ],
    ['a non-hex signature', '/api/v1/mastermind/fleet/state', 'PUT', 'not-hex'],
    ['a signed POST', '/api/v1/mastermind/fleet/state', 'POST', SIGNATURE],
    [
      'another fleet path',
      '/api/v1/mastermind/fleet/answers',
      'PUT',
      SIGNATURE,
    ],
    ['a nested path', '/api/v1/mastermind/fleet/state/x', 'PUT', SIGNATURE],
  ])('rejects %s', (_label, path, method, signature) => {
    expect(isSignedFleetPublish(request(path, method, signature))).toBe(false);
  });

  it('sizes the bucket for a 15 s cadence on two routes plus bursts', () => {
    expect(FLEET_PUBLISHER_ROUTE_POLICY.rateLimits.mutate).toEqual([
      { window: 'minute', limit: 30, duration: '1 m' },
      { window: 'hour', limit: 1200, duration: '1 h' },
      { window: 'day', limit: 12_000, duration: '1 d' },
    ]);
    expect(FLEET_PUBLISHER_ROUTE_POLICY.rateLimits.get).toEqual([]);
  });

  it('always adds the fleet policy, and the email override only when present', () => {
    expect(webProxyRoutePolicies(false).map((p) => p.key)).toEqual([
      'fleet-publisher',
    ]);
    expect(webProxyRoutePolicies(true).map((p) => p.key)).toEqual([
      'fleet-publisher',
      'email-rate-limit-override',
    ]);
  });
});
