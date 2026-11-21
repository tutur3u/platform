import { describe, expect, it, vi } from 'vitest';
import {
  fleetGrantInputSchema,
  fleetTierCeiling,
  getFleetOwnerConsole,
  grantFleetAccess,
  revokeFleetAccess,
  setFleetDisplayValue,
  setFleetStopped,
  upsertFleetProject,
} from './fleet';

const baseUrl = 'https://tuturuuu.com';
const userId = '7d3c2f1e-4b5a-4c6d-8e7f-9a0b1c2d3e4f';

function recorder(body: unknown = { result: 'ok' }) {
  return vi.fn(
    async (_url: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify(body), {
        headers: { 'Content-Type': 'application/json' },
      })
  );
}

const grant = {
  email: 'person@example.com',
  tier: 'observer' as const,
  capabilities: ['status.read' as const],
  projectKeys: ['platform'],
  expiresAt: null,
  questionsPerHour: 30,
  intentsPerDay: 10,
  modelBudgetPerMonth: 0,
  expectedGeneration: null,
};

describe('Fleet Owner clients', () => {
  it('reads the console without caching', async () => {
    const fetch = recorder();
    await getFleetOwnerConsole({ baseUrl, fetch });
    expect(String(fetch.mock.calls[0]?.[0])).toBe(
      'https://tuturuuu.com/api/v1/fleet/owner/access'
    );
    expect(fetch.mock.calls[0]?.[1]?.cache).toBe('no-store');
  });

  it('posts each Owner change as JSON to its route', async () => {
    const fetch = recorder();
    const options = { baseUrl, fetch };
    await grantFleetAccess(grant, options);
    await revokeFleetAccess({ userId, expectedGeneration: '2' }, options);
    await setFleetStopped({ stopped: true, expectedGeneration: '3' }, options);
    await upsertFleetProject(
      { key: 'platform', nameEn: 'Platform', nameVi: 'Nền tảng' },
      options
    );
    await setFleetDisplayValue(
      { projectKey: 'platform', field: 'lane', value: 'Web', approved: true },
      options
    );
    expect(fetch.mock.calls.map(([url]) => String(url))).toEqual([
      `${baseUrl}/api/v1/fleet/owner/grants`,
      `${baseUrl}/api/v1/fleet/owner/grants/revoke`,
      `${baseUrl}/api/v1/fleet/owner/control`,
      `${baseUrl}/api/v1/fleet/owner/projects`,
      `${baseUrl}/api/v1/fleet/owner/display-values`,
    ]);
    for (const [, init] of fetch.mock.calls) {
      expect(init?.method).toBe('POST');
      expect(init?.cache).toBe('no-store');
      expect(new Headers(init?.headers).get('content-type')).toBe(
        'application/json'
      );
    }
    expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))).toEqual(grant);
  });
});

describe('Fleet grant input', () => {
  it('admits each tier up to its ceiling and never the Owner tier', () => {
    for (const [tier, capabilities] of Object.entries(fleetTierCeiling)) {
      expect(
        fleetGrantInputSchema.safeParse({
          ...grant,
          tier,
          capabilities: [...capabilities],
        }).success
      ).toBe(true);
    }
    expect(
      fleetGrantInputSchema.safeParse({ ...grant, tier: 'owner' }).success
    ).toBe(false);
    expect(
      fleetGrantInputSchema.safeParse({
        ...grant,
        capabilities: ['status.read', 'approve.low'],
      }).success
    ).toBe(false);
    expect(
      fleetGrantInputSchema.safeParse({
        ...grant,
        tier: 'operator',
        capabilities: ['fleet.stop'],
      }).success
    ).toBe(false);
  });
});
