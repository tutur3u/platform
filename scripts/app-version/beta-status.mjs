#!/usr/bin/env node
// Publishes which ledger build each beta channel verifiably shipped, as public
// JSON on the rolling `app-release-status` prerelease:
//   https://github.com/tutur3u/platform/releases/download/app-release-status/<platform>.json
// Each platform file has exactly one writer (its store pipeline), so the
// mobile and desktop workflows never race on the same asset.
//   node beta-status.mjs <platform> <store>   (env: APP_VERSION, APP_BUILD, APP_LABEL)
import { pathToFileURL } from 'node:url';
import { github } from './allocate.mjs';
import { parseVersion } from './ledger.mjs';

const REPOSITORY = 'tutur3u/platform';
export const STATUS_TAG = 'app-release-status';
export const STATUS_PLATFORMS = {
  ios: ['testflight'],
  android: ['google-play-internal'],
  desktop: ['github-release'],
};

export function statusDocument({
  platform,
  store,
  version,
  build,
  label,
  sha,
  now,
}) {
  if (!STATUS_PLATFORMS[platform]?.includes(store))
    throw new Error(`Unknown beta channel ${platform}/${store}`);
  if (!parseVersion(version)) throw new Error('Version must be X.Y.Z');
  const number = Number(build);
  if (!Number.isSafeInteger(number) || number < 1)
    throw new Error('Build must be a positive integer');
  if (!/^[a-f0-9]{40}$/u.test(sha ?? ''))
    throw new Error('Commit SHA required');
  return {
    schema: 1,
    platform,
    channel: 'beta',
    store,
    version,
    build: number,
    label:
      typeof label === 'string' && label.length <= 80
        ? label
        : `${version} (build ${number})`,
    sha,
    publishedAt: now.toISOString(),
  };
}

/** Never move a channel backwards when an older run finishes late. */
export function shouldReplace(current, next) {
  return !Number.isSafeInteger(current?.build) || next.build >= current.build;
}

/** Immutable per-build records live in shards: GitHub caps assets per release. */
export const RECORDS_PER_SHARD = 500;
export function recordShardTag(platform, build) {
  return `${STATUS_TAG}-${platform}-${Math.floor(build / RECORDS_PER_SHARD)}`;
}

async function ensureRelease(request, tag, sha, body) {
  const read = () => request(`/repos/${REPOSITORY}/releases/tags/${tag}`);
  try {
    return await read();
  } catch (error) {
    if (error.status !== 404) throw error;
  }
  try {
    return await request(`/repos/${REPOSITORY}/releases`, {
      method: 'POST',
      body: {
        tag_name: tag,
        target_commitish: sha,
        name: tag,
        body,
        prerelease: true,
        make_latest: 'false',
      },
    });
  } catch (error) {
    // The other pipeline created it first.
    if (error.status !== 422) throw error;
    return read();
  }
}

async function uploadAsset({ request, token, release, name, document }) {
  // A failed upload leaves a `starter` asset that blocks the name; clear it.
  const stale = release.assets?.find(
    (asset) => asset.name === name && asset.state !== 'uploaded'
  );
  if (stale)
    await request(`/repos/${REPOSITORY}/releases/assets/${stale.id}`, {
      method: 'DELETE',
    });
  const upload = await fetch(
    `https://uploads.github.com/repos/${REPOSITORY}/releases/${release.id}/assets?name=${encodeURIComponent(name)}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: `${JSON.stringify(document, null, 2)}\n`,
      redirect: 'error',
      signal: AbortSignal.timeout(30_000),
    }
  );
  if (!upload.ok) throw new Error(`Status upload failed (${upload.status})`);
}

async function readPublished(asset, fetchImpl = fetch) {
  // Public prerelease assets need no token, so none leaves for the CDN.
  const response = await fetchImpl(asset.browser_download_url, {
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok)
    throw new Error(`Current status is unreadable (${response.status})`);
  const current = await response.json().catch(() => null);
  if (!Number.isSafeInteger(current?.build))
    throw new Error('Current status is unreadable');
  return current;
}

const RECORD = /^(android|desktop|ios)-([1-9]\d{0,9})\.json$/u;

/** Highest uploaded per-build record for a platform, across every shard. */
async function highestRecord(request, platform, fetchImpl) {
  const shardTag = new RegExp(`^${STATUS_TAG}-${platform}-(\\d+)$`, 'u');
  const shards = [];
  // Scan to exhaustion: a partial scan could miss a newer record and repair
  // the pointer with an older build.
  const MAX_PAGES = 1000;
  for (let page = 1; ; page++) {
    if (page > MAX_PAGES)
      throw new Error('Release list is too long to scan; pointer left as is');
    const releases = await request(
      `/repos/${REPOSITORY}/releases?per_page=100&page=${page}`
    );
    if (!Array.isArray(releases))
      throw new Error('Release list is unreadable; pointer left as is');
    for (const release of releases) {
      const match = shardTag.exec(release.tag_name ?? '');
      if (match) shards.push({ shard: Number(match[1]), release });
    }
    if (releases.length < 100) break;
  }
  // Higher shards hold higher builds; skip shards with no finished record.
  for (const { release } of shards.sort((a, b) => b.shard - a.shard)) {
    let best = null;
    for (const asset of release.assets ?? []) {
      const match = RECORD.exec(asset.name);
      if (!match || match[1] !== platform || asset.state !== 'uploaded')
        continue;
      if (!best || Number(match[2]) > Number(RECORD.exec(best.name)[2]))
        best = asset;
    }
    if (best) return readPublished(best, fetchImpl);
  }
  return null;
}

/**
 * Publishes an immutable `<platform>-<build>.json` record (sharded), then
 * moves the `<platform>.json` pointer on `app-release-status` forward. The
 * pointer never drops below the highest verified record, an unreadable
 * pointer is never overwritten, and readers fall back to the highest record
 * while the pointer is being replaced.
 */
export async function publishStatus({ request, token, document, fetchImpl }) {
  const recordTag = recordShardTag(document.platform, document.build);
  let records = await ensureRelease(
    request,
    recordTag,
    document.sha,
    'Immutable beta status records. The current pointer is on the app-release-status release.'
  );
  const recordName = `${document.platform}-${document.build}.json`;
  if (
    !records.assets?.some(
      (asset) => asset.name === recordName && asset.state === 'uploaded'
    )
  ) {
    await uploadAsset({
      request,
      token,
      release: records,
      name: recordName,
      document,
    });
    records = await request(`/repos/${REPOSITORY}/releases/${records.id}`);
  }
  // A newer run may have recorded its build and then failed before moving the
  // pointer; never let this older run install a lower build.
  const floor =
    (await highestRecord(request, document.platform, fetchImpl)) ?? document;
  const target = floor.build > document.build ? floor : document;

  const status = await ensureRelease(
    request,
    STATUS_TAG,
    document.sha,
    'Machine-readable status of the newest verified beta build per platform. `<platform>.json` points at the newest build; immutable `<platform>-<build>.json` records live on the app-release-status-<platform>-<shard> releases.'
  );
  const name = `${document.platform}.json`;
  const pointer = status.assets?.find(
    (asset) => asset.name === name && asset.state === 'uploaded'
  );
  if (pointer) {
    const current = await readPublished(pointer, fetchImpl);
    if (!shouldReplace(current, target) || current.build === target.build) {
      console.log(
        `${name} already reports build ${current.build}; keeping it.`
      );
      return 'kept';
    }
    await request(`/repos/${REPOSITORY}/releases/assets/${pointer.id}`, {
      method: 'DELETE',
    });
  }
  await uploadAsset({
    request,
    token,
    release: status,
    name,
    document: target,
  });
  console.log(`Published ${name}: ${target.label}.`);
  return 'published';
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const token = process.env.GITHUB_TOKEN;
    if (!token) throw new Error('GITHUB_TOKEN is required');
    const [platform, store] = process.argv.slice(2);
    const document = statusDocument({
      platform,
      store,
      version: process.env.APP_VERSION,
      build: process.env.APP_BUILD,
      label: process.env.APP_LABEL,
      sha: process.env.GITHUB_SHA,
      now: new Date(),
    });
    await publishStatus({
      request: (path, options) => github(path, { ...options, token }),
      token,
      document,
    });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
