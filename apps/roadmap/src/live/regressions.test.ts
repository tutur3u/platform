/** Regression suites (run via src/roadmap-data.test.ts). */
/**
 * D79 data tests for the public roadmap. Every guard has a broken variant
 * that must fail: a validator that accepts anything, a status engine that
 * claims "live" without deploy proof, or a feed that leaks incident or
 * client wording must turn this suite red.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { comingSoon, visibleComingSoon } from '../content/coming-soon.ts';
import { showPlans, tracks } from '../content/tracks.ts';
import {
  feedItem,
  INCIDENT_TERMS,
  localDay,
  shippedFeed,
  termHash,
} from '../live/feed.ts';
import {
  classifyProbeResponse,
  hostsResponse,
  parseHostsPayload,
  isSameZoneUrl,
  PROBED_APPS,
  probeHosts,
  resetHostsMemo,
  RUNTIME_PROBED_APPS,
} from '../live/host-probe.ts';
import {
  type LiveData,
  mergeLiveData,
  type PrFact,
  parseLiveData,
} from '../live/model.ts';
import {
  type Deliverable,
  deriveDeliverable,
  deriveTracks,
  indexLiveData,
} from '../live/status.ts';
import { buildView, matchesFilter } from '../view-model.ts';

const NOW = Date.parse('2026-11-10T08:00:00Z');
const SHA_A = 'a'.repeat(40);
const SHA_B = 'b'.repeat(40);

function pr(overrides: Partial<PrFact> & { number: number }): PrFact {
  return {
    title: 'feat(tasks): plan sprints from the board',
    state: 'merged',
    draft: false,
    approved: false,
    mergedAt: '2026-11-09T03:00:00.000Z',
    ...overrides,
  };
}

function data(overrides: Partial<LiveData> = {}): LiveData {
  return {
    schema: 1,
    generatedAt: '2026-11-10T07:55:00.000Z',
    source: 'build',
    main: { sha: SHA_B, at: '2026-11-10T07:00:00.000Z' },
    prs: [],
    hosts: [],
    ...overrides,
  };
}

const deliverable = (overrides: Partial<Deliverable> = {}): Deliverable => ({
  id: 'x',
  title: 'X',
  prs: [1],
  app: 'tasks',
  fallback: 'planned',
  ...overrides,
});

describe('production hosting regression (same-zone probes)', () => {
  const build = parseLiveData(
    JSON.parse(
      readFileSync(new URL('../generated/live.json', import.meta.url), 'utf8')
    )
  );
  const VERCEL_COMMIT = '4382dd3223b7ec40782ae1f7fad3b0e5837d64bf';
  const buildWorkers = build.hosts.filter(
    (h) => h.platform === 'workers'
  ).length;

  it('the build-time probe sees the apps that run on Workers', () => {
    assert.ok(buildWorkers >= 10, `only ${buildWorkers} apps on Workers`);
  });

  it('the Worker never probes hosts in its own zone at runtime', async () => {
    assert.ok(RUNTIME_PROBED_APPS.length > 0);
    assert.ok(RUNTIME_PROBED_APPS.every((entry) => !isSameZoneUrl(entry.url)));
    assert.ok(PROBED_APPS.some((entry) => isSameZoneUrl(entry.url)));
    resetHostsMemo();
    const seen: string[] = [];
    const fetcher = (async (url: string) => {
      seen.push(url);
      return new Response('{}', { status: 404 });
    }) as unknown as typeof fetch;
    await hostsResponse('GET', fetcher, SHA_B, NOW);
    assert.ok(seen.length > 0);
    assert.ok(
      seen.every((url) => !isSameZoneUrl(url)),
      seen.join(',')
    );
    resetHostsMemo();
  });

  it('broken variant: same-zone probes misread as Vercel cannot flip Workers apps', () => {
    // Shape of the production /roadmap/api/hosts answer on 10 Nov 2026.
    const misread = data({
      generatedAt: new Date(NOW).toISOString(),
      source: 'live',
      hosts: build.hosts
        .filter((h) => h.app !== 'mobile' && h.app !== 'roadmap')
        .map((h) => ({
          app: h.app,
          platform: 'vercel' as const,
          commit: h.platform === 'workers' ? VERCEL_COMMIT : null,
          commitAt:
            h.platform === 'workers' ? '2026-11-08T23:42:45.000Z' : null,
          behindBy: h.platform === 'workers' ? 190 : null,
        })),
    });
    const merged = mergeLiveData(build, misread);
    const view = buildView(merged, NOW);
    assert.equal(view.onWorkers, buildView(build, NOW).onWorkers);
    for (const host of build.hosts.filter((h) => h.platform === 'workers')) {
      const after = merged.hosts.find((h) => h.app === host.app);
      assert.equal(after?.platform, 'workers', host.app);
      assert.equal(after?.commit, host.commit, host.app);
    }
    assert.equal(view.totals.live, buildView(build, NOW).totals.live);
  });

  it('a failed probe is unknown, never Vercel', async () => {
    const results = await probeHosts(
      (async () => {
        throw new Error('network');
      }) as unknown as typeof fetch,
      null
    );
    assert.ok(
      results
        .filter((r) => r.app !== 'roadmap')
        .every((r) => r.platform === 'unknown')
    );
    assert.deepEqual(
      classifyProbeResponse(
        200,
        new Headers({ 'content-type': 'text/html' }),
        '<html>'
      ),
      { platform: 'unknown', commit: null }
    );
  });
});

describe('plans flag', () => {
  it('is on by default and shows exactly the approved copy', () => {
    assert.equal(showPlans, true);
    assert.deepEqual(visibleComingSoon(), comingSoon);
  });
  it('hides the card with the flag off, without touching the copy', () => {
    assert.deepEqual(visibleComingSoon(false), []);
    assert.equal(
      comingSoon[0].body,
      'Mira subscription plans at $100 and $200/month for access to Mira at the highest limits and capabilities.'
    );
  });
});

describe('no-slash canonical address', () => {
  it('restores /roadmap after the router writes its slash root', async () => {
    const { canonicalAddress, canonicalRoadmapLocation, withoutTrailingSlash } =
      await import('../request-boundary.ts');
    assert.equal(
      canonicalAddress({
        pathname: '/roadmap/',
        search: '?x=1',
        hash: '#tracks',
      }),
      '/roadmap?x=1#tracks'
    );
    assert.equal(
      canonicalAddress({ pathname: '/roadmap', search: '', hash: '' }),
      null
    );
    assert.equal(withoutTrailingSlash('/roadmap/notes//'), '/roadmap/notes');
    assert.equal(withoutTrailingSlash('/'), '/');
    // Broken variant: a slash canonical would be a second hop.
    assert.equal(
      canonicalRoadmapLocation(new URL('https://roadmap.tuturuuu.com/')),
      'https://tuturuuu.com/roadmap'
    );
    assert.notEqual(
      canonicalRoadmapLocation(new URL('https://roadmap.tuturuuu.com/?q=1')),
      'https://tuturuuu.com/roadmap/?q=1'
    );
  });
});

describe('shared marketing shell package', () => {
  const root = new URL(
    '../../../../packages/marketing-shell/src/',
    import.meta.url
  );
  it('stays framework-agnostic (no Next imports) so every app can share it', () => {
    const files = readdirSync(root, { recursive: true })
      .map(String)
      .filter((f) => /\.(ts|tsx)$/.test(f));
    assert.ok(files.length >= 8);
    for (const file of files)
      assert.doesNotMatch(
        readFileSync(new URL(file, root), 'utf8'),
        /from ['"](next|next\/[^'"]+|next-intl[^'"]*|framer-motion)['"]/,
        file
      );
  });
  it('ships the OFL licences beside the self-hosted fonts', () => {
    const fonts = readdirSync(new URL('fonts/', root)).map(String);
    assert.ok(fonts.some((f) => f.startsWith('be-vietnam-pro-')));
    assert.ok(fonts.includes('jetbrains-mono-variable.woff2'));
    for (const licence of ['OFL-BeVietnamPro.txt', 'OFL-JetBrainsMono.txt']) {
      assert.ok(fonts.includes(licence), licence);
      assert.match(
        readFileSync(new URL(`fonts/${licence}`, root), 'utf8'),
        /SIL Open Font License/
      );
    }
  });
});
