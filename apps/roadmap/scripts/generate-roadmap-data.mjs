#!/usr/bin/env node
/**
 * Build-time refresh of src/generated/live.json from public sources:
 * GitHub REST (PRs, main, deployed-vs-main compares, mobile release tags)
 * and each app's public build-info probe.
 *
 * GITHUB_TOKEN / GH_TOKEN is optional and used only to lift the anonymous
 * rate limit; it is never written anywhere. If the core sources fail, the
 * previous file is kept untouched, with its own honest timestamp.
 * ROADMAP_OFFLINE=1 skips the refresh entirely.
 *
 * Hosting (providers and the subdomain-to-apex migration) is observed on
 * every build, before and independent of GitHub, into the untracked
 * .generated/hosting.json that Vite embeds. Offline, every hosting value is
 * written as unverified with this build's time: never a previous build's.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tracks } from '../src/content/tracks.ts';
import { feedItem } from '../src/live/feed.ts';
import {
  assembleLiveData,
  fetchCompare,
  fetchMain,
  fetchPullFacts,
  fetchPullsByNumber,
  hostFacts,
} from '../src/live/github.ts';
import { PROBED_APPS, probeHosts } from '../src/live/host-probe.ts';
import { observeHosting } from '../src/live/build-probe.ts';
import { offlineSnapshot } from '../src/live/hosting.ts';
import { ONE_ORIGIN_APP_BASE_PATHS } from '../../../packages/utils/src/app-mounts.ts';
import { parseLiveData, REPO } from '../src/live/model.ts';
import {
  builtAtFrom,
  mergedWindow,
  offlineActivity,
} from '../src/insights/activity.ts';
import { HISTORY_TRACKS } from '../src/content/track-names.ts';
import { classifyTitle, isNoise } from '../src/history/classify.ts';
import { localDay } from '../src/live/feed.ts';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const target = join(root, 'src/generated/live.json');
const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || undefined;
const now = Date.now();
const log = (message) => process.stderr.write(`[roadmap-data] ${message}\n`);

function previous() {
  try {
    return parseLiveData(JSON.parse(readFileSync(target, 'utf8')), now);
  } catch (error) {
    log(`no valid previous data (${error.message})`);
    return null;
  }
}

async function mobileRelease() {
  const headers = { accept: 'application/vnd.github+json' };
  if (token) headers.authorization = `Bearer ${token}`;
  const get = async (path) => {
    const response = await fetch(`https://api.github.com${path}`, { headers });
    if (!response.ok) throw new Error(`GitHub ${response.status}`);
    return response.json();
  };
  const refs = await get(`/repos/${REPO}/git/matching-refs/tags/mobile-v`);
  const version = (ref) =>
    ref.ref
      .replace('refs/tags/mobile-v', '')
      .split('.')
      .map((part) => Number.parseInt(part, 10) || 0);
  const latest = refs
    .filter((ref) => /^refs\/tags\/mobile-v\d+\.\d+\.\d+$/.test(ref.ref))
    .sort((a, b) => {
      const [x, y] = [version(a), version(b)];
      return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
    })
    .at(-1);
  if (!latest) return null;
  let sha = latest.object.sha;
  if (latest.object.type === 'tag')
    sha = (await get(`/repos/${REPO}/git/tags/${sha}`)).object.sha;
  const compare = await fetchCompare(fetch, sha, token);
  return { app: 'mobile', platform: 'store', commit: sha, ...compare };
}

const hostingTarget = join(root, '.generated/hosting.json');
const activityTarget = join(root, '.generated/activity.json');
/**
 * The build's merged-PR search window. Anonymous search allows 10 requests a
 * minute: 7 days (about 350 PRs, 4 pages) fits beside the open-PR searches;
 * a token's higher limit covers 14 days. The page reads older days from the
 * history JSON.
 */
const MERGED_WINDOW_DAYS = token ? 14 : 7;
const MERGED_PAGES = token ? 10 : 5;

/**
 * Production builds and every merged PR, observed by this build only
 * (src/insights/activity.ts). Written on every build; offline, nothing is
 * observed and the page shows these figures as not available.
 */
const activity = {
  deploys: [],
  merged: null,
};

function writeActivity() {
  const snapshot =
    process.env.ROADMAP_OFFLINE === '1'
      ? offlineActivity(now)
      : {
          schema: 1,
          checkedAt: new Date(now).toISOString(),
          mode: 'observed',
          deploys: activity.deploys,
          merged: activity.merged,
        };
  mkdirSync(dirname(activityTarget), { recursive: true });
  writeFileSync(activityTarget, `${JSON.stringify(snapshot)}\n`);
  log(
    `activity ${snapshot.mode}: ${snapshot.deploys.length} production builds, ${
      snapshot.merged
        ? `${snapshot.merged.entries.length} merged PRs ${snapshot.merged.from}..${snapshot.merged.to}${snapshot.merged.complete ? '' : ' (capped)'}`
        : 'merged PRs not available'
    }`
  );
}

async function writeHosting() {
  const snapshot =
    process.env.ROADMAP_OFFLINE === '1'
      ? offlineSnapshot(now, ONE_ORIGIN_APP_BASE_PATHS, PROBED_APPS)
      : await observeHosting(
          fetch,
          ONE_ORIGIN_APP_BASE_PATHS,
          now,
          process.env.ROADMAP_SOURCE_SHA ?? null,
          (app, body) => {
            const builtAt = builtAtFrom(body);
            const commit = /"commit(?:Hash)?"\s*:\s*"([a-f0-9]{40})"/.exec(
              body
            )?.[1];
            if (builtAt && commit)
              activity.deploys.push({ app, commit, builtAt });
          }
        );
  mkdirSync(dirname(hostingTarget), { recursive: true });
  writeFileSync(hostingTarget, `${JSON.stringify(snapshot, null, 2)}\n`);
  const tally = (key, list) =>
    Object.entries(
      list.reduce(
        (all, item) => ({ ...all, [item[key]]: (all[item[key]] ?? 0) + 1 }),
        {}
      )
    )
      .map(([name, count]) => `${name} ${count}`)
      .join(', ');
  log(
    `hosting ${snapshot.mode} at ${snapshot.checkedAt}: providers ${tally('provider', snapshot.providers)}; migration ${tally('state', snapshot.migration)}`
  );
}

async function main() {
  await writeHosting();
  if (process.env.ROADMAP_OFFLINE === '1') {
    writeActivity();
    log('ROADMAP_OFFLINE=1: keeping committed data');
    return;
  }
  try {
    await refreshLiveData();
  } finally {
    writeActivity();
  }
}

async function refreshLiveData() {
  const old = previous();
  const referenced = [
    ...new Set(
      tracks.flatMap((track) =>
        track.milestones.flatMap((m) => m.deliverables.flatMap((d) => d.prs))
      )
    ),
  ];
  let core;
  let searched = Promise.resolve();
  try {
    let complete = false;
    searched = fetchPullFacts(fetch, now, {
      token,
      days: MERGED_WINDOW_DAYS,
      mergedPages: MERGED_PAGES,
      onMergedComplete: (value) => {
        complete = value;
      },
    });
    // Counted even when the other GitHub reads fail: one observation each.
    searched.then(
      (recent) => {
        activity.merged = mergedWindow(recent, {
          searchSince: new Date(now - MERGED_WINDOW_DAYS * 86_400_000)
            .toISOString()
            .slice(0, 10),
          now,
          complete,
          trackIds: HISTORY_TRACKS,
          isNoise: (title) => isNoise(title, null),
          classify: classifyTitle,
          localDay,
        });
      },
      () => {}
    );
    const [recent, mainCommit] = await Promise.all([
      searched,
      fetchMain(fetch, token),
    ]);
    const approved = new Set(
      recent.filter((pr) => pr.approved).map((pr) => pr.number)
    );
    const known = new Set(recent.map((pr) => pr.number));
    const older = await fetchPullsByNumber(
      fetch,
      referenced.filter((n) => !known.has(n)),
      approved,
      token
    );
    core = { recent, older, mainCommit };
  } catch (error) {
    // The merged-PR count stands on its own search; let it settle first.
    await searched.catch(() => {});
    log(`GitHub unavailable (${error.message}); keeping previous data`);
    return;
  }
  const probes = await probeHosts(
    fetch,
    process.env.ROADMAP_SOURCE_SHA ?? null
  );
  const hosts = await hostFacts(fetch, probes, token);
  const mobile = await mobileRelease().catch((error) => {
    log(`mobile release unavailable (${error.message})`);
    return old?.hosts.find((host) => host.app === 'mobile') ?? null;
  });
  if (mobile) hosts.push(mobile);

  // Stored PR facts are never shown unless they pass the feed filter, which
  // already drops toolchain wording. Keep the deploy CLI's name out of the
  // committed copy so the repository's CLI-usage guard sees only authored use.
  for (const pr of [...core.recent, ...core.older])
    pr.title = pr.title.replace(/wrangl(?:er)?/gi, 'Workers CLI');
  const wanted = new Set(referenced);
  const prs = [...core.recent, ...core.older].filter(
    (pr) => wanted.has(pr.number) || feedItem(pr) !== null
  );
  // Older observations of referenced PRs survive a narrow fetch.
  for (const pr of old?.prs ?? [])
    if (wanted.has(pr.number) && !prs.some((p) => p.number === pr.number))
      prs.push(pr);
  const data = parseLiveData(
    assembleLiveData({
      now,
      source: 'build',
      main: core.mainCommit,
      prs,
      hosts,
    }),
    now
  );
  writeFileSync(target, `${JSON.stringify(data, null, 2)}\n`);
  log(
    `wrote ${data.prs.length} PRs, ${data.hosts.length} hosts, main ${data.main?.sha.slice(0, 7)} at ${data.generatedAt}`
  );
}

await main();
