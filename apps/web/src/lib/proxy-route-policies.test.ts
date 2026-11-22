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
  it.each([
    ['PUT', '/api/v1/mastermind/fleet/state'],
    ['PUT', '/api/v1/mastermind/fleet/usage'],
    ['PUT', '/api/v1/mastermind/fleet/review-assets/mockup-1'],
    ['GET', '/api/v1/mastermind/fleet/answers'],
    ['POST', '/api/v1/mastermind/fleet/answers'],
    ['GET', '/api/v1/mastermind/fleet/alerts'],
    ['PUT', '/api/v1/mastermind/fleet/alerts'],
    ['POST', '/api/v1/mastermind/fleet/bridge/ticket'],
  ])('selects a signed %s to %s', (method, path) => {
    expect(isSignedFleetPublish(request(path, method, SIGNATURE))).toBe(true);
  });

  it('ignores the nonce query a signed pull carries', () => {
    expect(
      isSignedFleetPublish(
        request('/api/v1/mastermind/fleet/answers?nonce=abc', 'GET', SIGNATURE)
      )
    ).toBe(true);
  });

  it.each([
    ['an unsigned PUT', '/api/v1/mastermind/fleet/state', 'PUT', undefined],
    ['an unsigned pull', '/api/v1/mastermind/fleet/answers', 'GET', undefined],
    ['uppercase hex', '/api/v1/mastermind/fleet/state', 'PUT', 'A'.repeat(64)],
    [
      'a short signature',
      '/api/v1/mastermind/fleet/state',
      'PUT',
      'a'.repeat(63),
    ],
    ['a non-hex signature', '/api/v1/mastermind/fleet/state', 'PUT', 'not-hex'],
    [
      'a signed POST of state',
      '/api/v1/mastermind/fleet/state',
      'POST',
      SIGNATURE,
    ],
    [
      'a signed PUT of answers',
      '/api/v1/mastermind/fleet/answers',
      'PUT',
      SIGNATURE,
    ],
    [
      'a signed GET of state',
      '/api/v1/mastermind/fleet/state',
      'GET',
      SIGNATURE,
    ],
    [
      'a signed POST of alerts',
      '/api/v1/mastermind/fleet/alerts',
      'POST',
      SIGNATURE,
    ],
    [
      'a signed asset read',
      '/api/v1/mastermind/fleet/review-assets/mockup-1',
      'GET',
      SIGNATURE,
    ],
    [
      'a signed owner read',
      '/api/v1/mastermind/fleet/threads',
      'GET',
      SIGNATURE,
    ],
    [
      'a signed owner reply',
      '/api/v1/mastermind/fleet/replies',
      'POST',
      SIGNATURE,
    ],
    [
      'a signed live ticket',
      '/api/v1/mastermind/fleet/live/ticket',
      'POST',
      SIGNATURE,
    ],
    [
      'a nested state path',
      '/api/v1/mastermind/fleet/state/x',
      'PUT',
      SIGNATURE,
    ],
    [
      'a nested asset path',
      '/api/v1/mastermind/fleet/review-assets/a/b',
      'PUT',
      SIGNATURE,
    ],
    [
      'a path with a publisher suffix',
      '/api/v1/other/fleet/answers',
      'GET',
      SIGNATURE,
    ],
    [
      'an object-prototype method name',
      '/api/v1/mastermind/fleet/state',
      'constructor',
      SIGNATURE,
    ],
  ])('rejects %s', (_label, path, method, signature) => {
    expect(isSignedFleetPublish(request(path, method, signature))).toBe(false);
  });

  it('sizes both buckets for a 15 s cadence plus bursts', () => {
    // Two pulls a run (answers, alerts): 8 a minute and 11,520 a day.
    expect(FLEET_PUBLISHER_ROUTE_POLICY.rateLimits.get).toEqual([
      { window: 'minute', limit: 30, duration: '1 m' },
      { window: 'hour', limit: 1200, duration: '1 h' },
      { window: 'day', limit: 24_000, duration: '1 d' },
    ]);
    expect(FLEET_PUBLISHER_ROUTE_POLICY.rateLimits.mutate).toEqual([
      { window: 'minute', limit: 30, duration: '1 m' },
      { window: 'hour', limit: 1200, duration: '1 h' },
      { window: 'day', limit: 12_000, duration: '1 d' },
    ]);
    const ticksPerDay = (24 * 60 * 60) / 15;
    const [, , readsPerDay] = FLEET_PUBLISHER_ROUTE_POLICY.rateLimits.get;
    expect(readsPerDay?.limit).toBeGreaterThanOrEqual(2 * ticksPerDay);
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
