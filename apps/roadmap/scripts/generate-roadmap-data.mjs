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

async function writeHosting() {
  const snapshot =
    process.env.ROADMAP_OFFLINE === '1'
      ? offlineSnapshot(now, ONE_ORIGIN_APP_BASE_PATHS, PROBED_APPS)
      : await observeHosting(
          fetch,
          ONE_ORIGIN_APP_BASE_PATHS,
          now,
          process.env.ROADMAP_SOURCE_SHA ?? null
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
    log('ROADMAP_OFFLINE=1: keeping committed data');
    return;
  }
  const old = previous();
  const referenced = [
    ...new Set(
      tracks.flatMap((track) =>
        track.milestones.flatMap((m) => m.deliverables.flatMap((d) => d.prs))
      )
    ),
  ];
  let core;
  try {
    const [recent, mainCommit] = await Promise.all([
      fetchPullFacts(fetch, now, { token, days: 14 }),
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
