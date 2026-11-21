import { describe, expect, it } from 'vitest';
import {
  CLOUDFLARE_ORIGIN_AUTH_HEADER,
  type ClientIpConfig,
  resolveClientIp,
} from '../abuse-protection/client-ip';
import { createOriginClientIpProof } from '../abuse-protection/origin-ip-proof';
import {
  cmsDeliverySite,
  SHARED_EGRESS_AGGREGATE_MULTIPLIER,
  SHARED_EGRESS_SITE_MULTIPLIER,
  sharedEgressSubjects,
} from '../api-proxy-limiter-subjects';
import { makeRequest } from './api-proxy-test-request';

const EGRESS = '104.22.222.49';
const WORKER_EGRESS = '2a06:98c0:3600::103';
const NO_PROXY: ClientIpConfig = { mode: 'none', trustedHops: 1 };
const PROFILE = {
  get: [{ duration: '1 m' as const, limit: 60, window: 'minute' as const }],
  mutate: [{ duration: '1 m' as const, limit: 30, window: 'minute' as const }],
};
const ids = (subjects: Array<{ id: string }> | null) =>
  subjects?.map(({ id }) => id) ?? null;

describe('sharedEgressSubjects', () => {
  it('keeps a visitor address on its own per-IP bucket', async () => {
    const req = makeRequest('/api/v1/users/me', 'GET');
    expect(await sharedEgressSubjects(req, '203.0.113.42', 'p', PROFILE)).toBe(
      null
    );
  });

  it('keys anonymous traffic from a shared address by client and caps the address', async () => {
    const req = makeRequest('/api/v1/anything', 'GET', { 'user-agent': 'A' });
    const other = makeRequest('/api/v1/anything', 'GET', { 'user-agent': 'B' });
    const first = await sharedEgressSubjects(req, EGRESS, 'p', PROFILE);
    const second = await sharedEgressSubjects(other, EGRESS, 'p', PROFILE);
    expect(first?.[0]?.id).toMatch(/^egress:104\.22\.222\.49:[0-9a-f]{24}$/u);
    expect(first?.[0]?.id).not.toBe(second?.[0]?.id);
    expect(first?.[1]).toEqual({
      id: `egress:${EGRESS}`,
      prefix: `p:egress-x${SHARED_EGRESS_AGGREGATE_MULTIPLIER}`,
      rateLimits: {
        get: [
          { ...PROFILE.get[0], limit: 60 * SHARED_EGRESS_AGGREGATE_MULTIPLIER },
        ],
        mutate: [
          {
            ...PROFILE.mutate[0],
            limit: 30 * SHARED_EGRESS_AGGREGATE_MULTIPLIER,
          },
        ],
      },
    });
    expect(ids(first)).not.toContain(`ip:${EGRESS}`);
  });

  it('isolates the CMS delivery budget of two client sites', async () => {
    const siteA = makeRequest(
      '/api/v1/workspaces/Site-A/external-projects/delivery',
      'GET'
    );
    const siteB = makeRequest(
      '/api/v1/workspaces/site-b/external-projects/assets/logo',
      'GET'
    );
    const a = await sharedEgressSubjects(siteA, EGRESS, 'p', PROFILE);
    const b = await sharedEgressSubjects(siteB, EGRESS, 'p', PROFILE);
    expect(ids(a)).toEqual([`site:site-a:ip:${EGRESS}`, `egress:${EGRESS}`]);
    expect(ids(b)).toEqual([`site:site-b:ip:${EGRESS}`, `egress:${EGRESS}`]);
    expect(a?.[0]?.rateLimits.get[0]?.limit).toBe(
      60 * SHARED_EGRESS_SITE_MULTIPLIER
    );
    expect(
      cmsDeliverySite(
        makeRequest('/api/v1/workspaces/site-a/external-projects/delivery')
      )
    ).toBe(null);
    expect(
      cmsDeliverySite(
        makeRequest(
          '/api/v1/workspaces/site-a/external-projects/entries',
          'GET'
        )
      )
    ).toBe(null);
  });

  it('keeps fake app-token rotation inside the client key and address aggregate', async () => {
    const subjects = await Promise.all(
      ['ttr_one', 'ttr_two', 'ttr_three'].map((token) =>
        sharedEgressSubjects(
          makeRequest('/api/v1/anything', 'GET', {
            authorization: `Bearer ${token}`,
            'user-agent': 'A',
          }),
          EGRESS,
          'p',
          PROFILE,
          NO_PROXY
        )
      )
    );
    expect(
      new Set(subjects.map((subject) => ids(subject)?.join(' '))).size
    ).toBe(1);
    expect(
      subjects.flatMap((subject) => ids(subject) ?? [])
    ).not.toContainEqual(expect.stringMatching(/^app:|ttr_/u));
  });

  it('bounds fingerprint rotation by the shared address aggregate', async () => {
    const subjects = await Promise.all(
      ['A', 'B', 'C'].map((agent) =>
        sharedEgressSubjects(
          makeRequest('/api/v1/anything', 'GET', { 'user-agent': agent }),
          EGRESS,
          'p',
          PROFILE,
          NO_PROXY
        )
      )
    );
    expect(new Set(subjects.map((subject) => subject?.[0]?.id)).size).toBe(3);
    for (const subject of subjects) {
      expect(subject?.[1]?.id).toBe(`egress:${EGRESS}`);
    }
  });

  it('never lets one address drain a site for another address', async () => {
    const read = (ip: string) =>
      sharedEgressSubjects(
        makeRequest(
          '/api/v1/workspaces/site-a/external-projects/delivery',
          'GET'
        ),
        ip,
        'p',
        PROFILE,
        NO_PROXY
      );
    const first = await read(EGRESS);
    const second = await read('172.64.0.9');
    expect(first?.[0]?.id).toBe(`site:site-a:ip:${EGRESS}`);
    expect(second?.[0]?.id).toBe('site:site-a:ip:172.64.0.9');
    expect(ids(first)).not.toEqual(expect.arrayContaining(ids(second) ?? []));
  });

  it('keys Worker traffic per CF-Worker zone, outside the shared address aggregate', async () => {
    const fromZone = (zone: string, path = '/api/v1/anything') =>
      sharedEgressSubjects(
        makeRequest(path, 'GET', { 'cf-worker': zone, 'user-agent': 'A' }),
        WORKER_EGRESS,
        'p',
        PROFILE,
        NO_PROXY
      );
    const evil = await fromZone('Evil.Example');
    const good = await fromZone('good.example');
    expect(ids(evil)).toEqual(['worker:evil.example']);
    expect(ids(good)).toEqual(['worker:good.example']);
    expect(evil?.[0]?.prefix).toBe(
      `p:worker-x${SHARED_EGRESS_AGGREGATE_MULTIPLIER}`
    );
    const site = await fromZone(
      'good.example',
      '/api/v1/workspaces/site-a/external-projects/delivery'
    );
    expect(ids(site)).toEqual([
      'site:site-a:worker:good.example',
      'worker:good.example',
    ]);
    // The platform's own zone and malformed values name no caller.
    expect(ids(await fromZone('tuturuuu.com'))?.[1]).toBe(
      `egress:${WORKER_EGRESS}`
    );
    expect(ids(await fromZone('not a zone'))?.[1]).toBe(
      `egress:${WORKER_EGRESS}`
    );
  });

  it('ignores spoofed cf-connecting-ip and X-Forwarded-For without a valid proof', async () => {
    const secret = 'synthetic-cloudflare-origin-secret-at-least-32';
    const config: ClientIpConfig = {
      mode: 'cloudflare-origin',
      trustedHops: 1,
      originAuthSecret: secret,
    };
    const headers = (proof?: string) =>
      new Headers({
        ...(proof ? { [CLOUDFLARE_ORIGIN_AUTH_HEADER]: proof } : {}),
        'cf-connecting-ip': '198.51.100.7',
        'x-forwarded-for': '198.51.100.8',
        'x-vercel-forwarded-for': EGRESS,
      });
    const spoofedIp = resolveClientIp(headers(), config);
    expect(spoofedIp).toBe(EGRESS);
    const spoofed = await sharedEgressSubjects(
      makeRequest('/api/v1/anything', 'GET'),
      spoofedIp,
      'p',
      PROFILE
    );
    expect(ids(spoofed)?.join(' ')).not.toMatch(/198\.51\.100/u);

    const proof = createOriginClientIpProof({ ip: '203.0.113.42', secret });
    if (!proof) throw new Error('Invalid fixture');
    const visitorIp = resolveClientIp(headers(proof), config);
    expect(visitorIp).toBe('203.0.113.42');
    expect(
      await sharedEgressSubjects(
        makeRequest('/api/v1/anything', 'GET'),
        visitorIp,
        'p',
        PROFILE
      )
    ).toBe(null);
  });
});
