/**
 * D79 data tests for the public roadmap. Every guard has a broken variant
 * that must fail: a validator that accepts anything, a status engine that
 * claims "live" without deploy proof, or a feed that leaks incident or
 * client wording must turn this suite red.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import './csp.test.ts';
import './history/history.test.ts';
import './live/regressions.test.ts';
import './content/workshops/edufest-2026.test.ts';
import { comingSoon, visibleComingSoon } from './content/coming-soon.ts';
import { showPlans, tracks } from './content/tracks.ts';
import {
  feedItem,
  INCIDENT_TERMS,
  localDay,
  shippedFeed,
  termHash,
} from './live/feed.ts';
import {
  classifyProbeResponse,
  hostsResponse,
  parseHostsPayload,
  isSameZoneUrl,
  PROBED_APPS,
  probeHosts,
  resetHostsMemo,
  RUNTIME_PROBED_APPS,
} from './live/host-probe.ts';
import {
  type LiveData,
  mergeLiveData,
  type PrFact,
  parseLiveData,
} from './live/model.ts';
import {
  type Deliverable,
  deriveDeliverable,
  deriveTracks,
  indexLiveData,
} from './live/status.ts';
import { buildView, matchesFilter } from './view-model.ts';

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

describe('live data validator', () => {
  it('accepts the committed generated data', () => {
    const raw = JSON.parse(
      readFileSync(new URL('./generated/live.json', import.meta.url), 'utf8')
    );
    const parsed = parseLiveData(raw);
    assert.equal(parsed.schema, 1);
    assert.ok(parsed.prs.length > 0, 'generated data has pull requests');
  });

  it('accepts a well-formed payload', () => {
    const parsed = parseLiveData(
      data({
        prs: [pr({ number: 1 })],
        hosts: [
          {
            app: 'tasks',
            platform: 'workers',
            commit: SHA_A,
            commitAt: '2026-11-10T01:00:00Z',
            behindBy: 3,
          },
        ],
      }),
      NOW
    );
    assert.equal(parsed.hosts[0].commitAt, '2026-11-10T01:00:00.000Z');
  });

  const broken: [string, unknown][] = [
    ['null', null],
    ['wrong schema', { ...data(), schema: 2 }],
    ['extra field', { ...data(), secret: 'x' }],
    ['missing hosts', (({ hosts: _h, ...rest }) => rest)(data())],
    ['future observation', data({ generatedAt: '2026-11-11T08:00:00Z' })],
    ['bad time', data({ generatedAt: 'yesterday' })],
    ['merged without time', data({ prs: [pr({ number: 1, mergedAt: null })] })],
    ['open with merge time', data({ prs: [pr({ number: 1, state: 'open' })] })],
    ['duplicate PR', data({ prs: [pr({ number: 1 }), pr({ number: 1 })] })],
    [
      'PR extra field',
      data({ prs: [{ ...pr({ number: 1 }), body: 'x' } as PrFact] }),
    ],
    [
      'bad commit',
      data({
        hosts: [
          {
            app: 'tasks',
            platform: 'workers',
            commit: 'local',
            commitAt: null,
            behindBy: null,
          },
        ],
      }),
    ],
    [
      'unknown platform',
      data({
        hosts: [
          {
            app: 'tasks',
            platform: 'aws' as 'workers',
            commit: null,
            commitAt: null,
            behindBy: null,
          },
        ],
      }),
    ],
    [
      'compare facts without commit',
      data({
        hosts: [
          {
            app: 'tasks',
            platform: 'vercel',
            commit: null,
            commitAt: null,
            behindBy: 4,
          },
        ],
      }),
    ],
  ];
  for (const [name, value] of broken) {
    it(`rejects a broken variant: ${name}`, () => {
      assert.throws(() => parseLiveData(value, NOW));
    });
  }
});

describe('status engine', () => {
  const host = (
    commitAt: string | null,
    platform: 'workers' | 'vercel' | 'unknown' = 'workers'
  ) => ({
    app: 'tasks',
    platform,
    commit: commitAt ? SHA_A : null,
    commitAt,
    behindBy: commitAt ? 0 : null,
  });

  it('is live only when the deploy is at or after the merge', () => {
    const index = indexLiveData(
      data({ prs: [pr({ number: 1 })], hosts: [host('2026-11-09T05:00:00Z')] })
    );
    const state = deriveDeliverable(deliverable(), index);
    assert.equal(state.status, 'live');
    assert.equal(state.shippedAt, '2026-11-09T03:00:00.000Z');
  });

  it('broken variant: an older deploy is not live', () => {
    const index = indexLiveData(
      data({ prs: [pr({ number: 1 })], hosts: [host('2026-11-08T00:00:00Z')] })
    );
    assert.equal(
      deriveDeliverable(deliverable(), index).status,
      'waiting_for_prod_sync'
    );
  });

  it('broken variant: an unverifiable deploy is never live', () => {
    const index = indexLiveData(
      data({ prs: [pr({ number: 1 })], hosts: [host(null, 'vercel')] })
    );
    const state = deriveDeliverable(deliverable(), index);
    assert.equal(state.status, 'waiting_for_prod_sync');
    assert.equal(state.unverifiedDeploy, true);
  });

  it('needs every PR merged before shipping', () => {
    const index = indexLiveData(
      data({
        prs: [
          pr({ number: 1 }),
          pr({ number: 2, state: 'open', mergedAt: null }),
        ],
        hosts: [host('2026-11-10T00:00:00Z')],
      })
    );
    assert.equal(
      deriveDeliverable(deliverable({ prs: [1, 2] }), index).status,
      'in_progress'
    );
  });

  it('waits for merge only when every open PR is ready and approved', () => {
    const ready = indexLiveData(
      data({
        prs: [pr({ number: 1, state: 'open', mergedAt: null, approved: true })],
      })
    );
    assert.equal(
      deriveDeliverable(deliverable(), ready).status,
      'waiting_for_merge'
    );
    const draft = indexLiveData(
      data({
        prs: [
          pr({
            number: 1,
            state: 'open',
            mergedAt: null,
            approved: true,
            draft: true,
          }),
        ],
      })
    );
    assert.equal(deriveDeliverable(deliverable(), draft).status, 'in_progress');
  });

  it('broken variant: missing evidence falls back, never to live', () => {
    const index = indexLiveData(data());
    assert.equal(deriveDeliverable(deliverable(), index).status, 'planned');
    assert.equal(
      deriveDeliverable(deliverable({ fallback: 'in_progress' }), index).status,
      'in_progress'
    );
    const closed = indexLiveData(
      data({ prs: [pr({ number: 1, state: 'closed', mergedAt: null })] })
    );
    assert.equal(deriveDeliverable(deliverable(), closed).status, 'planned');
  });

  it('hosting moves are live only while the probe answers from Workers', () => {
    const onVercel = indexLiveData(
      data({ prs: [pr({ number: 1 })], hosts: [host(null, 'vercel')] })
    );
    assert.equal(
      deriveDeliverable(deliverable({ requires: 'workers' }), onVercel).status,
      'waiting_for_prod_sync'
    );
    const onWorkers = indexLiveData(
      data({ prs: [pr({ number: 1 })], hosts: [host(null, 'workers')] })
    );
    assert.equal(
      deriveDeliverable(deliverable({ requires: 'workers' }), onWorkers).status,
      'live'
    );
  });

  it('mobile ships only once a store release contains the merge', () => {
    const release = (commitAt: string) =>
      indexLiveData(
        data({
          prs: [pr({ number: 1 })],
          hosts: [
            {
              app: 'mobile',
              platform: 'store',
              commit: SHA_A,
              commitAt,
              behindBy: 1,
            },
          ],
        })
      );
    const item = deliverable({ app: 'mobile' });
    assert.equal(
      deriveDeliverable(item, release('2026-11-10T00:00:00Z')).status,
      'live'
    );
    assert.equal(
      deriveDeliverable(item, release('2026-11-01T00:00:00Z')).status,
      'waiting_for_prod_sync'
    );
  });
});

describe('curated content', () => {
  it('covers every requested track', () => {
    const ids = tracks.map((track) => track.id);
    for (const id of [
      'platform',
      'tasks',
      'chat',
      'calendar',
      'finance',
      'drive',
      'mail',
      'meet',
      'mastermind',
      'mobile',
      'mira',
      'upskii',
      'security',
      'dx',
    ])
      assert.ok(ids.includes(id), `missing track ${id}`);
  });

  it('has unique ids, real PR numbers and no curated live claims', () => {
    const seen = new Set<string>();
    for (const track of tracks)
      for (const milestone of track.milestones)
        for (const item of milestone.deliverables) {
          assert.ok(!seen.has(item.id), `duplicate ${item.id}`);
          seen.add(item.id);
          assert.ok(['planned', 'in_progress'].includes(item.fallback));
          for (const number of item.prs)
            assert.ok(Number.isInteger(number) && number > 0);
          assert.ok(item.title.length <= 90, item.title);
        }
    assert.ok(seen.size >= 150, 'roadmap stays granular');
  });

  it('never publishes internal or incident wording', () => {
    const text = JSON.stringify(tracks);
    for (const term of [
      /\bAtlas\b/,
      /\bRex\b/,
      /\bPax\b/,
      /\bSelene\b/,
      /\bD\d{2}\b/,
      /incident/i,
      /vulnerab/i,
      /\bCVE\b/i,
      /breach/i,
      /token/i,
      /\blane\b/i,
      /\bfleet\b/i,
    ])
      assert.doesNotMatch(text, term);
  });

  it('keeps the approved plan copy verbatim', () => {
    assert.deepEqual(
      comingSoon.map(({ title, body }) => ({ title, body })),
      [
        {
          title: 'Mira subscription plans',
          body: 'Mira subscription plans at $100 and $200/month for access to Mira at the highest limits and capabilities.',
        },
      ]
    );
  });
});

describe('shipped feed safety', () => {
  const merged = (number: number, title: string) =>
    pr({ number, title, mergedAt: '2026-11-10T02:00:00.000Z' });

  it('publishes user-facing features from public product scopes', () => {
    const item = feedItem(
      merged(
        10,
        'feat(meet): floating self-preview and calmer ended screen (#10)'
      )
    );
    assert.deepEqual(item && { title: item.title, track: item.track }, {
      title: 'Floating self-preview and calmer ended screen',
      track: 'meet',
    });
  });

  const denied = [
    'feat(tasks): fix the data leak in shared boards',
    'feat(chat): incident follow-up for message delivery',
    'feat(mail): patch XSS in the renderer',
    'feat(calendar): rotate the provider token',
    'feat(finance): customer-specific invoice preset',
    'feat(meet): outage banner after the postmortem',
    'feat(ci): seal the production artifact',
    'chore(tasks): bump dependencies',
    'fix(tasks): repair drag and drop',
    'feat(unknown-scope): something new',
    'feat(tasks): ship the D74 runbook',
    'feat(drive): vulnerability disclosure page',
  ];
  for (const title of denied) {
    it(`denylist drops: ${title}`, () => {
      assert.equal(feedItem(merged(11, title)), null);
    });
  }

  it('drops hashed client names without publishing them', () => {
    const hashes = new Set([termHash('Acme Academy'), termHash('globex')]);
    assert.equal(
      feedItem(
        merged(12, 'feat(tasks): board presets for Acme Academy'),
        hashes
      ),
      null
    );
    assert.equal(
      feedItem(merged(13, 'feat(finance): Globex tuition view'), hashes),
      null
    );
    assert.ok(
      feedItem(merged(14, 'feat(tasks): board presets for every team'), hashes)
    );
  });

  it('broken variant: an empty incident pattern would leak', () => {
    assert.ok(INCIDENT_TERMS.test('security incident'));
    assert.ok(INCIDENT_TERMS.test('Client portal'));
  });

  it('keeps only the last 7 days, newest first', () => {
    const feed = shippedFeed(
      [
        merged(20, 'feat(tasks): newest sprint view'),
        pr({
          number: 21,
          title: 'feat(tasks): very old sprint view',
          mergedAt: '2026-10-01T00:00:00Z',
        }),
        pr({
          number: 22,
          title: 'feat(meet): yesterday room layout',
          mergedAt: '2026-11-09T02:00:00Z',
        }),
      ],
      NOW
    );
    assert.deepEqual(
      feed.map((item) => item.number),
      [20, 22]
    );
  });

  it('groups days in Vietnam time', () => {
    assert.equal(localDay('2026-11-09T17:30:00Z'), '2026-11-10');
    assert.equal(localDay('2026-11-09T16:59:00Z'), '2026-11-09');
  });
});

describe('freshness', () => {
  it('a failed host probe never erases a known observation', () => {
    const older = data({
      hosts: [
        {
          app: 'tasks',
          platform: 'workers',
          commit: SHA_A,
          commitAt: '2026-11-10T01:00:00Z',
          behindBy: 0,
        },
      ],
    });
    const newer = data({
      generatedAt: '2026-11-10T07:59:00.000Z',
      source: 'live',
      hosts: [
        {
          app: 'tasks',
          platform: 'unknown',
          commit: null,
          commitAt: null,
          behindBy: null,
        },
      ],
    });
    const merged = mergeLiveData(older, newer);
    assert.equal(merged.hosts[0].platform, 'workers');
    assert.equal(merged.generatedAt, '2026-11-10T07:59:00.000Z');
    assert.equal(merged.source, 'live');
  });

  it('a narrow live refresh keeps older merged PRs', () => {
    const merged = mergeLiveData(
      data({ prs: [pr({ number: 1 })] }),
      data({ prs: [pr({ number: 2, state: 'open', mergedAt: null })] })
    );
    assert.deepEqual(
      merged.prs.map((p) => p.number),
      [2, 1]
    );
  });

  it('view counts and filters stay consistent', () => {
    const view = buildView(data({ prs: [pr({ number: 1 })] }), NOW, [
      {
        id: 'tasks',
        name: 'Tasks',
        summary: 's',
        milestones: [
          {
            id: 'm',
            title: 'M',
            deliverables: [
              deliverable({ app: null }),
              deliverable({ id: 'y', prs: [] }),
            ],
          },
        ],
      },
    ]);
    assert.equal(view.total, 2);
    assert.equal(view.totals.live, 1);
    assert.equal(view.totals.planned, 1);
    assert.equal(view.recent.length, 1);
    assert.ok(matchesFilter('waiting_for_prod_sync', 'shipped'));
    assert.ok(!matchesFilter('planned', 'shipped'));
    assert.equal(deriveTracks([], indexLiveData(data())).length, 0);
  });
});

describe('host probe', () => {
  const json = { 'content-type': 'application/json; charset=utf-8' };
  it('classifies Workers, Vercel and unknown hosts', () => {
    assert.deepEqual(
      classifyProbeResponse(
        200,
        new Headers({ ...json, server: 'cloudflare' }),
        JSON.stringify({ commitHash: SHA_A })
      ),
      { platform: 'workers', commit: SHA_A }
    );
    assert.deepEqual(
      classifyProbeResponse(
        200,
        new Headers({ ...json, server: 'cloudflare' }),
        '{"commitHash":"local"}'
      ),
      { platform: 'workers', commit: null }
    );
    assert.deepEqual(
      classifyProbeResponse(
        401,
        new Headers({ ...json, 'x-vercel-id': 'hkg1::x' }),
        '{}'
      ),
      { platform: 'vercel', commit: null }
    );
    assert.deepEqual(
      classifyProbeResponse(503, new Headers({ server: 'cloudflare' }), 'down'),
      {
        platform: 'unknown',
        commit: null,
      }
    );
  });

  it('broken variant: never leaks probe body or header content', () => {
    const result = classifyProbeResponse(
      200,
      new Headers({
        ...json,
        server: 'cloudflare',
        'set-cookie': 'session=secret',
      }),
      JSON.stringify({
        commitHash: SHA_A,
        environment: 'internal-secret',
        deploymentUrl: 'x',
      })
    );
    assert.deepEqual(Object.keys(result).sort(), ['commit', 'platform']);
    assert.doesNotMatch(JSON.stringify(result), /secret|internal/);
  });

  it('probes only the fixed allowlist, without following redirects', async () => {
    const seen: { url: string; redirect?: RequestRedirect }[] = [];
    const fetcher = (async (url: string, init?: RequestInit) => {
      seen.push({ url, redirect: init?.redirect });
      return new Response(JSON.stringify({ commitHash: SHA_A }), {
        headers: { ...json, server: 'cloudflare' },
      });
    }) as typeof fetch;
    const results = await probeHosts(fetcher, SHA_B);
    assert.deepEqual(
      seen.map((s) => s.url).sort(),
      PROBED_APPS.map((a) => a.url).sort()
    );
    assert.ok(seen.every((s) => s.redirect === 'manual'));
    assert.ok(
      seen.every((s) =>
        /^https:\/\/([a-z0-9-]+\.)?(tuturuuu\.com|ttr\.gg)\//.test(s.url)
      )
    );
    assert.equal(results.find((r) => r.app === 'roadmap')?.commit, SHA_B);
  });

  it('serves only {app, platform, commit}, uncached, and coalesces bursts', async () => {
    resetHostsMemo();
    let calls = 0;
    const fetcher = (async () => {
      calls += 1;
      return new Response('{}', { status: 404 });
    }) as unknown as typeof fetch;
    const first = await hostsResponse('GET', fetcher, SHA_B, NOW);
    const second = await hostsResponse('GET', fetcher, SHA_B, NOW + 5_000);
    assert.equal(calls, RUNTIME_PROBED_APPS.length, 'one fan-out per minute');
    assert.match(first.headers.get('cache-control') ?? '', /no-store/);
    const payload = parseHostsPayload(await second.json());
    for (const host of payload.hosts)
      assert.deepEqual(Object.keys(host).sort(), ['app', 'commit', 'platform']);
    assert.equal(
      (await hostsResponse('POST', fetcher, SHA_B, NOW)).status,
      405
    );
    resetHostsMemo();
  });

  it('broken variant: hosts payload with extra fields or unknown apps is rejected', () => {
    assert.throws(() =>
      parseHostsPayload({
        checkedAt: new Date(NOW).toISOString(),
        hosts: [
          { app: 'tasks', platform: 'workers', commit: null, ip: '1.2.3.4' },
        ],
      })
    );
    assert.throws(() =>
      parseHostsPayload({
        checkedAt: new Date(NOW).toISOString(),
        hosts: [{ app: 'ops-hub', platform: 'workers', commit: null }],
      })
    );
  });
});
