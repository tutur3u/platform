#!/usr/bin/env node
// biome-ignore-all lint/suspicious/noUndeclaredEnvVars: Store credentials and GitHub token exist only in the beta release job.
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { appleGet, listIosPrereleaseVersionRecords } from './build-name.mjs';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const output = new URL(
  '../../apps/mobile/assets/release_history.json',
  import.meta.url
);
const githubOrigin = 'https://api.github.com';

function versionParts(value) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/u.exec(value);
  return match ? match.slice(1).map(Number) : null;
}

function compareVersions(a, b) {
  const left = versionParts(a) ?? [];
  const right = versionParts(b) ?? [];
  for (let i = 0; i < 3; i++) {
    if (left[i] !== right[i]) return left[i] - right[i];
  }
  return 0;
}

function readableSubject(subject) {
  return subject
    .replace(/^\w+(?:\([^)]*\))?!?:\s*/u, '')
    .replace(/\s*\(#\d+\)$/u, '')
    .trim();
}

function historyBaseTag(version, sha, git) {
  const baseTag = `mobile-v${version[0]}.${version[1]}.0`;
  try {
    git('git', ['merge-base', '--is-ancestor', baseTag, sha], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    return baseTag;
  } catch {
    // A new minor can reach TestFlight before Release Please creates its tag.
  }
  try {
    return git(
      'git',
      [
        'describe',
        '--first-parent',
        '--tags',
        '--match',
        'mobile-v*',
        '--abbrev=0',
        sha,
      ],
      { cwd: repoRoot, encoding: 'utf8' }
    ).trim();
  } catch {
    console.warn(
      'No reachable mobile release tag; omitting unbounded history.'
    );
    return null;
  }
}

export function changesBetween(fromSha, toSha, git = execFileSync) {
  const lines = git(
    'git',
    [
      'log',
      '--first-parent',
      '--format=%s',
      `${fromSha}..${toSha}`,
      '--',
      'apps/mobile',
    ],
    { cwd: repoRoot, encoding: 'utf8' }
  ).split('\n');
  return [...new Set(lines.map(readableSubject).filter(Boolean))];
}

async function githubGet(path, token) {
  const response = await fetch(`${githubOrigin}${path}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok)
    throw new Error(`GitHub release lookup failed (${response.status})`);
  return response.json();
}

async function productionRuns(requiredRunNumbers, token) {
  const runs = new Map();
  for (let page = 1; page <= 5 && runs.size < requiredRunNumbers.size; page++) {
    const result = await githubGet(
      `/repos/tutur3u/platform/actions/workflows/mobile-deploy-stores.yaml/runs?per_page=100&page=${page}`,
      token
    );
    for (const run of result.workflow_runs ?? []) {
      if (requiredRunNumbers.has(run.run_number) && run.head_sha) {
        runs.set(run.run_number, run);
      }
    }
    if ((result.workflow_runs ?? []).length < 100) break;
  }
  return runs;
}

export async function releaseHistory({
  credentials,
  githubToken,
  version,
  sha,
  date,
  git = execFileSync,
}) {
  const current = versionParts(version);
  if (!current) throw new Error(`Invalid mobile release version: ${version}`);
  const records = await listIosPrereleaseVersionRecords(credentials);
  const relevant = records.filter((item) => {
    const parts = versionParts(item.attributes?.version);
    return (
      parts &&
      parts[0] === current[0] &&
      parts[1] === current[1] &&
      parts[2] > 0 &&
      compareVersions(item.attributes.version, version) < 0
    );
  });
  const uploaded = [];
  for (const record of relevant) {
    const response = await appleGet(
      `/v1/preReleaseVersions/${encodeURIComponent(record.id)}/builds?limit=200`,
      credentials
    );
    const builds = response.data ?? [];
    const build = builds
      .filter((item) => /^\d+$/u.test(item.attributes?.version ?? ''))
      .sort(
        (a, b) => Number(b.attributes.version) - Number(a.attributes.version)
      )[0];
    if (!build) continue;
    uploaded.push({
      version: record.attributes.version,
      buildNumber: build.attributes.version,
      runNumber: Math.floor((Number(build.attributes.version) - 100000) / 1000),
      date: build.attributes.uploadedDate?.slice(0, 10),
    });
  }
  const required = new Set(
    uploaded.map((item) => item.runNumber).filter((number) => number > 0)
  );
  const runs = await productionRuns(required, githubToken);
  const releases = uploaded
    .map((item) => ({
      version: item.version,
      date:
        item.date ?? runs.get(item.runNumber)?.created_at.slice(0, 10) ?? date,
      sha: runs.get(item.runNumber)?.head_sha ?? null,
      buildNumber: item.buildNumber,
    }))
    .sort((a, b) => compareVersions(a.version, b.version));
  releases.push({ version, date, sha });

  let previousSha = historyBaseTag(current, sha, git);
  return releases.map((item) => {
    if (!item.sha) {
      console.warn(
        `No source workflow for TestFlight ${item.version} (build ${item.buildNumber}); keeping the version without inferred changes.`
      );
      return { version: item.version, date: item.date, changes: [] };
    }
    if (!previousSha) {
      previousSha = item.sha;
      return { version: item.version, date: item.date, changes: [] };
    }
    const changes = changesBetween(previousSha, item.sha, git);
    previousSha = item.sha;
    return { version: item.version, date: item.date, changes };
  });
}

if (process.argv[1]?.endsWith('/release-history.mjs')) {
  try {
    const privateKey = await readFile(
      process.env.APP_STORE_CONNECT_PRIVATE_KEY_PATH,
      'utf8'
    );
    const releases = await releaseHistory({
      credentials: {
        privateKey,
        keyId: process.env.APP_STORE_CONNECT_API_KEY_ID,
        issuerId: process.env.APP_STORE_CONNECT_ISSUER_ID,
      },
      githubToken: process.env.GITHUB_TOKEN,
      version: process.env.MOBILE_BUILD_NAME,
      sha: process.env.GITHUB_SHA,
      date: new Date().toISOString().slice(0, 10),
    });
    await writeFile(output, `${JSON.stringify({ releases }, null, 2)}\n`);
    process.stdout.write(
      `Bundled notes for ${releases.length} mobile beta versions.\n`
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
