import { expect, it } from 'vite-plus/test';
import { parseShipRepos, shipCatalog } from './catalog';
import { readWorker } from './cloudflare';
import {
  buildShipQuery,
  HISTORY_PAGE,
  parseShipResponse,
  pendingRelease,
  latestRelease,
} from './github';
import { githubBearer } from './github-auth';
import { deployState } from './github-facts';
import { backoffUntil, RequestBudget, ShipSourceError } from './http';
import { ACCOUNT, CF_TOKEN, makeWorld, seedWorld, sha } from './test-world';

const NOW = Date.parse('2026-11-22T10:00:00Z');
const deps = (fetch: typeof globalThis.fetch) => ({
  deadline: NOW + 30_000,
  fetch,
  now: () => NOW,
});

it('parses MASTERMIND_SHIP_REPOS without widening what is read', () => {
  const repos = parseShipRepos(
    'pktm=acme/pktm@release, mastery-ai=acme/mastery,web=evil/repo,upskii=bad repo,x'
  );
  expect([...repos]).toEqual([
    ['pktm', { repository: 'acme/pktm', branch: 'release' }],
    ['mastery-ai', { repository: 'acme/mastery', branch: 'main' }],
  ]);
  const catalog = shipCatalog('pktm=acme/pktm');
  expect(catalog.find((app) => app.id === 'pktm')?.repository).toBe(
    'acme/pktm'
  );
  expect(catalog.find((app) => app.id === 'upskii')?.repository).toBe(
    'upskii/platform'
  );
  expect(catalog.find((app) => app.id === 'web')?.repository).toBe(
    'tutur3u/platform'
  );
});

it('builds one query per owner with every interpolated value quoted', () => {
  const specs = shipCatalog().filter(
    (app) => app.repository === 'tutur3u/platform'
  );
  const { repos, query } = buildShipQuery(specs);
  expect(repos).toEqual(['tutur3u/platform']);
  expect(query).toContain(
    'web_production: deployments(first: 10, environments: ["cloudflare-production-web"]'
  );
  expect(query).toContain('h1: history(first: 100, path: "packages")');
  expect(query).not.toContain('mobile_staging');
  expect(query.match(/repository\(/gu)).toHaveLength(1);
});

it('caps the pending count when a full page is newer than production', () => {
  const history = Array.from({ length: HISTORY_PAGE }, (_, index) => ({
    oid: sha(String(index % 10)).replace(/^./u, 'f'),
    committedDate: new Date(NOW - index * 60_000).toISOString(),
  }));
  const pending = pendingRelease(
    [history],
    { sha: sha('a'), committedAt: '2026-11-01T00:00:00.000Z' },
    sha('c')
  );
  expect(pending?.capped).toBe(true);
  expect(pendingRelease([history], null, sha('c'))).toBeNull();
  expect(
    pendingRelease([history], { sha: sha('a'), committedAt: null }, sha('c'))
  ).toBeNull();
});

it('backs off when the remaining GraphQL budget is low', () => {
  const specs = shipCatalog().filter((app) => app.id === 'upskii');
  const parsed = parseShipResponse(
    {
      data: {
        rateLimit: { remaining: 50, resetAt: '2026-11-22T10:40:00Z' },
        r0: {
          head: null,
          any: { nodes: [], pageInfo: { hasNextPage: false } },
        },
      },
    },
    specs,
    ['upskii/platform'],
    NOW
  );
  expect(parsed.retryAt).toBe(Date.parse('2026-11-22T10:40:00Z'));
  expect(parsed.facts.get('upskii')).toEqual({
    production: null,
    staging: null,
    pending: null,
    attempts: { production: null, staging: null },
  });
  // A partial answer or a missing repository never replaces known facts.
  for (const json of [
    { errors: [] },
    { data: { r0: { any: { nodes: [] } } }, errors: [{ type: 'NOT_FOUND' }] },
    { data: { rateLimit: null, r0: null } },
  ])
    expect(() =>
      parseShipResponse(json, specs, ['upskii/platform'], NOW)
    ).toThrow(ShipSourceError);
});

it('clamps backoff between one minute and one hour', () => {
  expect(backoffUntil(new Headers({ 'retry-after': '1' }), NOW)).toBe(
    NOW + 60_000
  );
  expect(backoffUntil(new Headers({ 'retry-after': '99999' }), NOW)).toBe(
    NOW + 3_600_000
  );
  expect(backoffUntil(new Headers(), NOW)).toBe(NOW + 600_000);
});

it('mints a GitHub App installation token and caches the installation id', async () => {
  const { world, fetch } = makeWorld();
  world.installations.set('tutur3u', 42);
  const pair = (await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify']
  )) as CryptoKeyPair;
  const der = new Uint8Array(
    (await crypto.subtle.exportKey('pkcs8', pair.privateKey)) as ArrayBuffer
  );
  const pem = `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...der))}\n-----END PRIVATE KEY-----`;
  const env = {
    MASTERMIND_SHIP_GITHUB_APP_ID: '123',
    MASTERMIND_SHIP_GITHUB_APP_PRIVATE_KEY: pem,
  };
  const installations: Record<string, number> = {};
  const budget = new RequestBudget(8);
  const token = await githubBearer(
    env,
    deps(fetch),
    budget,
    'tutur3u',
    'tutur3u/platform',
    installations
  );
  expect(token).toMatch(/^ghs_/u);
  expect(installations).toEqual({ tutur3u: 42 });
  await githubBearer(
    env,
    deps(fetch),
    budget,
    'tutur3u',
    'tutur3u/platform',
    installations
  );
  expect(world.log).toEqual([
    'github GET /repos/tutur3u/platform/installation',
    'github POST /app/installations/42/access_tokens',
    'github POST /app/installations/42/access_tokens',
  ]);
  await expect(
    githubBearer({}, deps(fetch), budget, 'tutur3u', 'tutur3u/platform', {})
  ).rejects.toMatchObject({ problem: 'not-configured' });
});

it('reads each Worker version once and stops at the request budget', async () => {
  const { world, fetch } = makeWorld();
  seedWorld(world);
  const env = {
    CLOUDFLARE_ACCOUNT_ID: ACCOUNT,
    MASTERMIND_SHIP_CLOUDFLARE_TOKEN: CF_TOKEN,
  };
  const versions = {};
  const budget = new RequestBudget(3);
  const first = await readWorker(
    env,
    deps(fetch),
    budget,
    'tuturuuu-calendar',
    versions
  );
  expect(first).toMatchObject({ sha: sha('a'), percentage: 100 });
  await readWorker(env, deps(fetch), budget, 'tuturuuu-calendar', versions);
  expect(world.log).toHaveLength(3);
  await expect(
    readWorker(env, deps(fetch), budget, 'tuturuuu-calendar', versions)
  ).rejects.toMatchObject({ problem: 'rate-limited' });
  expect(world.log).toHaveLength(3);
});

it('reads only a newest success as deployed and skips malformed nodes', () => {
  expect(deployState('SUCCESS')).toBe('ok');
  expect(deployState(undefined)).toBe('running');
  expect(deployState('QUEUED')).toBe('running');
  expect(deployState('INACTIVE')).toBe('failed');
  expect(deployState('FAILURE')).toBe('failed');
  const web = shipCatalog().find((app) => app.id === 'web')!;
  const success = {
    environment: 'cloudflare-production-web',
    createdAt: '2026-11-20T02:00:00Z',
    commitOid: sha('a'),
    latestStatus: { state: 'SUCCESS', createdAt: '2026-11-20T02:00:00Z' },
  };
  const inactive = {
    ...success,
    commitOid: sha('b'),
    latestStatus: { state: 'INACTIVE' },
  };
  expect(
    latestRelease([null, inactive, success] as never, web, 'production')
  ).toMatchObject({ sha: sha('a'), deploy: 'failed' });
  expect(
    latestRelease([inactive] as never, web, 'production', true)
  ).toBeUndefined();
});
