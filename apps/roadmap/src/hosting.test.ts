/**
 * D79 tests for build-time hosting: provider counts, the subdomain-to-apex
 * migration and their as-of time (via src/roadmap-data.test.ts). Each guard
 * has a broken variant that must fail.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import en from '../messages/en.json' with { type: 'json' };
import vi from '../messages/vi.json' with { type: 'json' };
import { ONE_ORIGIN_APP_BASE_PATHS } from '../../../packages/utils/src/app-mounts.ts';
import generated from './generated/live.json' with { type: 'json' };
import { PROBED_APPS } from './live/host-probe.ts';
import {
  classifyMigration,
  type HostingSnapshot,
  hostingAsOf,
  migrationSummary,
  offlineSnapshot,
  type ProbeOutcome,
  parseHostingSnapshot,
  providerCounts,
  SNAPSHOT_MAX_AGE_MS,
  snapshotForBuild,
} from './live/hosting.ts';
import { parseLiveData } from './live/model.ts';
import { buildView } from './view-model.ts';

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), 'utf8');
const NOW = Date.parse('2026-11-13T02:00:00Z');
const REGISTRY = ONE_ORIGIN_APP_BASE_PATHS as Record<string, string>;

function probed(overrides: Partial<HostingSnapshot> = {}): HostingSnapshot {
  return {
    checkedAt: new Date(NOW).toISOString(),
    mode: 'probed',
    registry: { ...REGISTRY },
    providers: [
      { app: 'tasks', provider: 'workers' },
      { app: 'calendar', provider: 'vercel' },
      { app: 'hive', provider: 'unknown' },
    ],
    migration: [],
    ...overrides,
  };
}

const answer = (
  status: number,
  extra: Partial<Extract<ProbeOutcome, { ok: true }>> = {}
): ProbeOutcome => ({
  ok: true,
  status,
  location: null,
  vercel: false,
  buildInfo: null,
  ...extra,
});

describe('hosting: provider counts come from this build only', () => {
  // The committed data file: its provider fields date from an older build.
  const stale = parseLiveData(generated, Date.parse(generated.generatedAt));
  const staleWorkers = stale.hosts.filter(
    (host) => host.platform === 'workers'
  ).length;

  it('a build that could not observe shows every app as not verifiable', () => {
    const offline = offlineSnapshot(NOW, REGISTRY, PROBED_APPS);
    const view = buildView(stale, NOW, undefined, offline);
    assert.equal(view.onWorkers, 0);
    assert.equal(view.hostingVerified, false);
    assert.ok(view.hosts.every((host) => host.platform === 'unknown'));
    // Broken variant: trusting the data file shows its stale count as current.
    assert.ok(staleWorkers > 0);
    assert.equal(buildView(stale, NOW).onWorkers, staleWorkers);
  });

  it('a probed build counts what it saw, whatever the data file says', () => {
    const view = buildView(stale, NOW, undefined, probed());
    const byApp = Object.fromEntries(
      view.hosts.map((host) => [host.app, host.platform])
    );
    assert.equal(byApp.tasks, 'workers');
    assert.equal(byApp.calendar, 'vercel');
    // Observed by nobody in this build: unknown, never the stored value.
    assert.equal(byApp.mail, 'unknown');
    assert.equal(view.hostingVerified, true);
    assert.deepEqual(providerCounts(probed(), ['tasks', 'calendar', 'mail']), {
      workers: 1,
      vercel: 1,
      unknown: 1,
    });
  });

  it('an offline or malformed snapshot never counts its provider list', () => {
    const carried = { ...probed(), mode: 'offline' as const };
    assert.deepEqual(providerCounts(carried, ['tasks']), {
      workers: 0,
      vercel: 0,
      unknown: 1,
    });
    assert.equal(parseHostingSnapshot({ mode: 'probed' }).mode, 'missing');
    assert.equal(parseHostingSnapshot(null).checkedAt, null);
  });
});

describe('hosting: the as-of time is the build time', () => {
  it('is the snapshot time, not the data file time', () => {
    const offline = offlineSnapshot(NOW, REGISTRY, PROBED_APPS);
    assert.equal(hostingAsOf(offline), new Date(NOW).toISOString());
    assert.notEqual(hostingAsOf(offline), generated.generatedAt);
    // Broken variant: the old page showed live.json's generatedAt.
    const old = read('./components/hosting.tsx');
    assert.ok(!old.includes('hostsCheckedAt'));
    assert.match(old, /hostingAsOf\(hosting\)/);
  });

  it('a build embeds only a snapshot written for it, never an older file', () => {
    const fresh = probed();
    assert.equal(snapshotForBuild(fresh, NOW + 5 * 60_000), fresh);
    // Broken variant: yesterday's file left before a bare `vp build`.
    assert.equal(snapshotForBuild(fresh, NOW + SNAPSHOT_MAX_AGE_MS + 1), null);
    assert.equal(snapshotForBuild({ mode: 'probed' }, NOW), null);
    assert.match(read('../vite.config.ts'), /snapshotForBuild\(/);
  });

  it('the build probe never buffers a large body', () => {
    const probe = read('./live/build-probe.ts');
    assert.match(probe, /await readBounded\(response\)/);
    // Broken variant: reading everything first, then checking the size.
    assert.ok(!/response\.text\(\)/.test(probe));
  });

  it('the build writes a fresh snapshot every time, before GitHub and offline mode', () => {
    const script = read('../scripts/generate-roadmap-data.mjs');
    const main = script.slice(script.indexOf('async function main()'));
    const write = main.indexOf('await writeHosting();');
    assert.ok(write > 0);
    assert.ok(write < main.indexOf("process.env.ROADMAP_OFFLINE === '1'"));
    assert.ok(write < main.indexOf('fetchPullFacts'));
    // Never committed, so an old observation cannot be reused.
    assert.match(read('../.gitignore'), /^\.generated\/$/m);
  });
});

describe('hosting: subdomain-to-apex migration states', () => {
  const to = 'https://tuturuuu.com/tasks';

  it('classifies each observation', () => {
    const redirect = answer(301, { location: to });
    assert.equal(
      classifyMigration(redirect, { ok: false }, to, 'tasks'),
      'done'
    );
    assert.equal(
      classifyMigration(
        answer(200),
        answer(200, {
          buildInfo: { commit: 'a'.repeat(40), appName: 'tasks' },
        }),
        to,
        'tasks'
      ),
      'in_progress'
    );
    assert.equal(
      classifyMigration(
        answer(200),
        answer(404, { vercel: true }),
        to,
        'tasks'
      ),
      'not_started'
    );
    assert.equal(
      classifyMigration({ ok: false }, answer(404), to, 'tasks'),
      'unverified'
    );
    // Broken variants: a login redirect, Vercel's answer, or another app's
    // build-info on the apex path are not a move.
    const login = answer(307, { location: 'https://tuturuuu.com/login?x=1' });
    assert.equal(
      classifyMigration(login, answer(404), to, 'tasks'),
      'not_started'
    );
    const viaVercel = answer(200, {
      vercel: true,
      buildInfo: { commit: 'a'.repeat(40), appName: 'web' },
    });
    assert.equal(
      classifyMigration(answer(200), viaVercel, to, 'tasks'),
      'not_started'
    );
    const other = answer(200, {
      buildInfo: { commit: 'a'.repeat(40), appName: 'web' },
    });
    assert.equal(
      classifyMigration(answer(200), other, to, 'tasks'),
      'not_started'
    );
  });

  it('counts only apps in the base-path registry', () => {
    const snapshot = probed({
      migration: [
        { app: 'tasks', from: 'https://tasks.tuturuuu.com', to, state: 'done' },
        // The roadmap lives on the apex but is not in the registry.
        {
          app: 'roadmap',
          from: 'https://roadmap.tuturuuu.com',
          to: 'https://tuturuuu.com/roadmap',
          state: 'done',
        },
      ],
    });
    const summary = migrationSummary(snapshot, REGISTRY);
    assert.equal(summary.total, Object.keys(REGISTRY).length);
    assert.equal(summary.counts.done, 1);
    assert.ok(!summary.entries.some((entry) => entry.app === 'roadmap'));
    // Registry apps nobody observed are unverified, never moved.
    assert.equal(summary.counts.unverified, summary.total - 1);
    // Broken variant: counting the observations instead of the registry.
    const naive = snapshot.migration.filter((e) => e.state === 'done').length;
    assert.equal(naive, 2);
  });

  it('an offline build observes nothing: every app unverified, with real paths', () => {
    const offline = offlineSnapshot(NOW, REGISTRY, PROBED_APPS);
    const summary = migrationSummary(offline, offline.registry);
    assert.equal(summary.counts.unverified, summary.total);
    const store = summary.entries.find((e) => e.app === 'storefront');
    assert.equal(store?.to, 'https://tuturuuu.com/store');
    assert.equal(store?.from, 'https://store.tuturuuu.com');
    // Broken variant: a "done" carried in an offline file does not count.
    const carried: HostingSnapshot = {
      ...offline,
      migration: offline.migration.map((e) => ({ ...e, state: 'done' })),
    };
    assert.equal(migrationSummary(carried, REGISTRY).counts.done, 0);
  });
});

describe('hosting: Cloudflare badge and copy', () => {
  it('serves Cloudflare’s official web badge unaltered, with alt text', () => {
    const badge = readFileSync(
      new URL('./assets/brands/cloudflare-protected-badge.png', import.meta.url)
    );
    assert.equal(
      createHash('sha256').update(badge).digest('hex'),
      '3d7b109fb7cd683025818d8c6d5224c565b0b2278099e666c15f7d2d8325067e'
    );
    assert.ok(en.hosting.badgeAlt && vi.hosting.badgeAlt);
    const css = read('./styles.css');
    const rule = css.slice(
      css.indexOf('\n.cf-badge {'),
      css.indexOf('}', css.indexOf('\n.cf-badge {'))
    );
    // Its own aspect ratio only: a fixed width with automatic height.
    assert.match(rule, /width: 152px;/);
    assert.match(rule, /height: auto;/);
    assert.ok(!/filter|border-radius|object-fit/.test(rule));
  });

  it('has migration copy in EN and VI with the same keys', () => {
    const keys = (value: object): string[] =>
      Object.entries(value).flatMap(([key, child]) =>
        child && typeof child === 'object'
          ? keys(child).map((k) => `${key}.${k}`)
          : [key]
      );
    assert.deepEqual(keys(en.migration), keys(vi.migration));
    assert.ok(en.migration.progress.includes('{done}'));
    assert.ok(vi.migration.progress.includes('{total}'));
  });
});
