import { readStyles } from './style-source.ts';
/**
 * D79 tests for build-time hosting: provider counts, the subdomain-to-apex
 * migration and their as-of time (via src/roadmap-data.test.ts). Each guard
 * has a broken variant that must fail.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
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
import { cssDeclarations } from './css-guards.ts';

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

const LOGO_SHA256 =
  '400b70b8bb7db80da137ef8e8fcb835a692410a3083598964da08ed1756df145';
const sha256 = (bytes: Buffer) =>
  createHash('sha256').update(bytes).digest('hex');
/** Declarations of one exact selector (outside media unless asked). */
const ruleOf = (css: string, selector: string, media = '') =>
  Object.fromEntries(
    cssDeclarations(css)
      .filter(
        (d) =>
          d.selector.split(/\s*,\s*/).includes(selector) &&
          d.media.join(' ') === media
      )
      .map((d) => [d.property, d.value])
  );
/** The ways an image gets altered rather than shown as published. */
const ALTERS =
  /^(filter|opacity|mix-blend-mode|border-radius|clip-path|mask|transform|object-fit|background|color)/;
const alters = (css: string, selector: string) =>
  cssDeclarations(css).filter(
    (d) =>
      d.selector.split(/\s*,\s*/).some((s) => s.trim().endsWith(selector)) &&
      ALTERS.test(d.property)
  );

describe('hosting: Cloudflare logo', () => {
  const component = read('./components/hosting.tsx');
  const css = readStyles();

  it('ships Cloudflare’s official logo byte-for-byte, served by this Worker', () => {
    const logo = readFileSync(
      new URL('./assets/brands/cloudflare-logo.png', import.meta.url)
    );
    assert.equal(sha256(logo), LOGO_SHA256);
    // 512×173 straight from the PNG header.
    assert.deepEqual(
      [logo.readUInt32BE(16), logo.readUInt32BE(20)],
      [512, 173]
    );
    assert.match(
      component,
      /import cloudflareLogo from '\.\.\/assets\/brands\/cloudflare-logo\.png\?no-inline';/
    );
    assert.match(
      read('./assets/brands/CLOUDFLARE-LOGO.md'),
      new RegExp(LOGO_SHA256)
    );
    // The badge it replaces is gone, with its copy.
    assert.ok(
      !existsSync(
        new URL(
          './assets/brands/cloudflare-protected-badge.png',
          import.meta.url
        )
      )
    );
    assert.ok(!('badgeAlt' in en.hosting) && !('badgeAlt' in vi.hosting));
    // Broken variants: one changed byte, or a hotlinked copy.
    const edited = Buffer.from(logo);
    edited[edited.length - 1] ^= 1;
    assert.notEqual(sha256(edited), LOGO_SHA256);
    assert.ok(!/src=["{]['"`]?https?:/.test(component));
    assert.ok(
      /src=["{]['"`]?https?:/.test(
        '<img src="https://cf-assets.www.cloudflare.com/l.png" />'
      )
    );
  });

  it('renders once, with alt text and fixed dimensions, apart from the heading text', () => {
    const tag = /<img\s+className="cf-logo"[^>]*\/>/.exec(component)?.[0] ?? '';
    assert.match(tag, /src=\{cloudflareLogo\}/);
    assert.match(tag, /alt=\{t\.hosting\.logoAlt\}/);
    assert.match(tag, /width=\{512\}/);
    assert.match(tag, /height=\{173\}/);
    assert.equal(en.hosting.logoAlt, 'Cloudflare');
    assert.equal(vi.hosting.logoAlt, 'Cloudflare');
    assert.ok(en.hosting.trademark.includes('Cloudflare, Inc.'));
    assert.ok(vi.hosting.trademark.includes('Cloudflare, Inc.'));
    // One placement: the Workers group head, after the heading closes.
    const uses = component.match(/<CloudflareLogo\b/g) ?? [];
    assert.equal(uses.length, 1);
    const head = component.slice(
      component.indexOf('<div className="host-group-head">'),
      component.indexOf('<ul className="hosts">')
    );
    assert.ok(head.indexOf('</h3>') < head.indexOf('<CloudflareLogo'));
    assert.match(head, /platform === 'workers' \? <CloudflareLogo/);
    // Broken variant: the logo inside the heading, run into its words.
    const inline = '<h3>Cloudflare Workers <CloudflareLogo t={t} /></h3>';
    assert.ok(inline.indexOf('</h3>') > inline.indexOf('<CloudflareLogo'));
  });

  it('keeps its own aspect ratio, unaltered, on a plate with clear space', () => {
    const logo = ruleOf(css, '.cf-logo');
    assert.equal(logo['aspect-ratio'], '512 / 173');
    assert.equal(logo.height, '48px');
    assert.equal(logo.width, 'auto');
    assert.deepEqual(alters(css, '.cf-logo'), []);
    const plate = ruleOf(css, '.cf-logo-plate');
    assert.ok(Number.parseInt(plate.padding ?? '0', 10) >= 12);
    assert.equal(plate.background, 'var(--rm-logo-plate)');
    // Broken variants: a stretched or effected logo is caught.
    assert.equal(
      alters(
        '.cf-logo { filter: grayscale(1); border-radius: 8px; }',
        '.cf-logo'
      ).length,
      2
    );
    assert.notEqual(
      ruleOf('.cf-logo { width: 152px; height: 48px; }', '.cf-logo')[
        'aspect-ratio'
      ],
      '512 / 173'
    );
  });

  it('dark theme lightens the plate and never recolours the logo', () => {
    const dark = ruleOf(css, '.dark .cf-logo-plate');
    assert.equal(dark['--rm-logo-plate'], 'var(--rm-ink)');
    assert.equal(
      ruleOf(css, '.cf-logo-plate')['--rm-logo-plate'],
      'var(--rm-panel)'
    );
    // No theme or media rule touches the image itself.
    const themed = cssDeclarations(css).filter(
      (d) => /\.cf-logo\b(?!-)/.test(d.selector) && d.selector !== '.cf-logo'
    );
    assert.deepEqual(themed, []);
    // Broken variants: an inverted logo, or a plate that stays dark.
    const inverted = '.dark .cf-logo { filter: invert(1); }';
    assert.equal(alters(inverted, '.cf-logo').length, 1);
    const unplated = '.cf-logo-plate { padding: 12px; }';
    assert.equal(
      ruleOf(unplated, '.dark .cf-logo-plate')['--rm-logo-plate'],
      undefined
    );
  });
});

describe('hosting: copy', () => {
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
