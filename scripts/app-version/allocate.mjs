#!/usr/bin/env node
// Allocates (or reuses) the shared app version and build number for the
// current production commit and writes them to GITHUB_OUTPUT:
//   version=X.Y.Z build=B label="X.Y.Z (build B[, ios fix])"
// `--reuse-only` never creates an entry, for jobs without contents: write.
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import {
  entryMessage,
  LEDGER_TAG_PREFIX,
  parseEntry,
  parseVersion,
  planAllocation,
  platformLabel,
  tagBuild,
} from './ledger.mjs';

const REPOSITORY = 'tutur3u/platform';
const CREATE_ATTEMPTS = 5;

export async function github(path, { method = 'GET', body, token } = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: body ? JSON.stringify(body) : undefined,
    redirect: 'error',
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    const error = new Error(
      `GitHub API ${method} ${path.split('?')[0]} failed (${response.status})`
    );
    error.status = response.status;
    throw error;
  }
  return response.status === 204 ? null : response.json();
}

/**
 * Parses `git cat-file --batch` output for annotated tag objects into
 * { name, target, message }. Malformed objects are skipped; their ref name
 * still reserves the build number.
 */
export function parseTagObjects(output) {
  const tags = [];
  let offset = 0;
  while (offset < output.length) {
    const headerEnd = output.indexOf('\n', offset);
    if (headerEnd === -1) break;
    const [, type, size] = output
      .subarray(offset, headerEnd)
      .toString()
      .split(' ');
    const length = Number(size);
    if (!Number.isSafeInteger(length)) break;
    const start = headerEnd + 1;
    const body = output.subarray(start, start + length).toString();
    offset = start + length + 1;
    if (type !== 'tag') continue;
    const split = body.indexOf('\n\n');
    if (split === -1) continue;
    const headers = body.slice(0, split).split('\n');
    const field = (key) =>
      headers.find((line) => line.startsWith(`${key} `))?.slice(key.length + 1);
    if (field('type') !== 'commit') continue;
    tags.push({
      name: field('tag'),
      target: field('object'),
      message: body.slice(split + 2).replace(/\n$/u, ''),
    });
  }
  return tags;
}

function gitOutput(args, input) {
  return execFileSync('git', args, {
    input,
    maxBuffer: 64 * 1024 * 1024,
    stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
  });
}

/** Reads the complete ledger from local tags (fetch them first). */
export function readLedger(run = gitOutput) {
  const refs = run([
    'for-each-ref',
    '--format=%(refname:strip=2) %(objecttype) %(objectname) %(*objectname)',
    `refs/tags/${LEDGER_TAG_PREFIX}*`,
  ])
    .toString()
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [name, type, object, peeled] = line.split(' ');
      return { name, type, object, peeled, build: tagBuild(name) };
    })
    .filter((ref) => ref.build !== null);
  // Every ref name reserves its number, even lightweight or malformed ones.
  const reservedBuild = Math.max(0, ...refs.map((ref) => ref.build));
  const annotated = refs.filter((ref) => ref.type === 'tag');
  const objects = annotated.length
    ? parseTagObjects(
        run(
          ['cat-file', '--batch'],
          `${annotated.map((ref) => ref.object).join('\n')}\n`
        )
      )
    : [];
  const entries = [];
  for (const ref of annotated) {
    const tag = objects.find(
      (item) => item.name === ref.name && item.target === ref.peeled
    );
    const entry = tag && parseEntry(ref.name, tag.message, ref.peeled);
    if (entry) entries.push(entry);
  }
  entries.sort((a, b) => b.build - a.build);
  return { entries, reservedBuild };
}

function isShallowCheckout() {
  return (
    gitOutput(['rev-parse', '--is-shallow-repository']).toString().trim() ===
    'true'
  );
}

export const localGit = {
  fetchLedger({ shallow = false } = {}) {
    const depthLimited = shallow && isShallowCheckout();
    // A depth-limited fetch fails when nothing matches, so an empty ledger is
    // detected first.
    if (
      depthLimited &&
      !gitOutput([
        'ls-remote',
        '--tags',
        'origin',
        `refs/tags/${LEDGER_TAG_PREFIX}*`,
      ])
        .toString()
        .trim()
    )
      return;
    execFileSync(
      'git',
      [
        'fetch',
        '--quiet',
        '--no-tags',
        // Read-only callers need tag objects, not history. Only a checkout that
        // is already shallow stays shallow; a full clone keeps its history.
        ...(depthLimited ? ['--depth=1'] : []),
        'origin',
        `+refs/tags/${LEDGER_TAG_PREFIX}*:refs/tags/${LEDGER_TAG_PREFIX}*`,
      ],
      { stdio: 'inherit' }
    );
  },
  read: () => readLedger(),
  ensureCommit(sha) {
    try {
      execFileSync('git', ['cat-file', '-e', `${sha}^{commit}`], {
        stdio: 'ignore',
      });
    } catch {
      // A winner's commit can be newer than this checkout.
      execFileSync('git', ['fetch', '--quiet', '--no-tags', 'origin', sha], {
        stdio: 'inherit',
      });
    }
  },
  isAncestor(ancestor, descendant) {
    localGit.ensureCommit(ancestor);
    localGit.ensureCommit(descendant);
    try {
      execFileSync(
        'git',
        ['merge-base', '--is-ancestor', ancestor, descendant],
        { stdio: 'ignore' }
      );
      return true;
    } catch (error) {
      if (error.status === 1) return false;
      throw error;
    }
  },
  changedFiles(from, to) {
    // NUL-delimited so quoted or unusual paths cannot dodge classification;
    // renames and copies list both sides.
    const fields = gitOutput([
      'diff',
      '--name-status',
      '-z',
      '--find-renames',
      `${from}..${to}`,
    ])
      .toString()
      .split('\0')
      .filter(Boolean);
    const files = [];
    for (let i = 0; i < fields.length;) {
      const count = /^[RC]/u.test(fields[i++]) ? 2 : 1;
      files.push(...fields.slice(i, i + count));
      i += count;
    }
    return files;
  },
};

export async function createEntry(request, entry) {
  const tagName = `${LEDGER_TAG_PREFIX}${entry.build}`;
  const tag = await request(`/repos/${REPOSITORY}/git/tags`, {
    method: 'POST',
    body: {
      tag: tagName,
      message: entryMessage(entry),
      object: entry.sha,
      type: 'commit',
    },
  });
  // Creating the ref is the atomic step: a second writer gets 422.
  await request(`/repos/${REPOSITORY}/git/refs`, {
    method: 'POST',
    body: { ref: `refs/tags/${tagName}`, sha: tag.sha },
  });
}

export async function allocate({ request, sha, pubspec, git, reuseOnly }) {
  for (let attempt = 1; attempt <= CREATE_ATTEMPTS; attempt++) {
    git.fetchLedger({ shallow: Boolean(reuseOnly) });
    const { entries, reservedBuild } = git.read();
    if (reuseOnly) {
      const entry = entries.find((item) => item.sha === sha);
      if (!entry)
        throw new Error(
          'No release ledger entry for this commit; run the desktop or mobile release for it first'
        );
      return { action: 'reuse', entry };
    }
    const plan = planAllocation({
      entries,
      reservedBuild,
      sha,
      pubspec,
      isAncestor: git.isAncestor,
      changedFiles: git.changedFiles,
    });
    if (plan.action !== 'create') return plan;
    try {
      await createEntry(request, plan.entry);
      return plan;
    } catch (error) {
      // Another writer took this build number; re-read and replan.
      if (error.status !== 422 || attempt === CREATE_ATTEMPTS) throw error;
    }
  }
  throw new Error('Release ledger allocation did not converge');
}

/**
 * Publish-time source-order check for jobs that reuse earlier outputs (a
 * failed-job rerun keeps its allocation). It needs no local history: GitHub's
 * compare API reports whether the newest entry's commit descends from `sha`.
 */
export async function isStale({ request, sha, git }) {
  git.fetchLedger({ shallow: true });
  const { entries } = git.read();
  const latest = entries[0];
  if (!entries.some((entry) => entry.sha === sha))
    throw new Error('This commit has no release ledger entry');
  if (!latest || latest.sha === sha) return false;
  const comparison = await request(
    `/repos/${REPOSITORY}/compare/${sha}...${latest.sha}`
  );
  if (
    !['ahead', 'behind', 'identical', 'diverged'].includes(comparison?.status)
  )
    throw new Error('GitHub compare returned an unknown status');
  if (comparison.status === 'diverged')
    throw new Error('Production history diverged from the release ledger');
  return comparison.status === 'ahead';
}

export function outputLines(plan) {
  if (plan.action === 'superseded') return ['superseded=true'];
  const { entry } = plan;
  // Entries are validated, but outputs feed shell commands: re-check shape.
  if (!parseVersion(entry.version) || !Number.isSafeInteger(entry.build))
    throw new Error('Refusing to emit an invalid ledger entry');
  const label = platformLabel(entry);
  if (!/^[\w .,/()-]{1,80}$/u.test(label))
    throw new Error('Refusing to emit an invalid ledger label');
  return [
    'superseded=false',
    `version=${entry.version}`,
    `build=${entry.build}`,
    `label=${label}`,
  ];
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const token = process.env.GITHUB_TOKEN;
    if (!token) throw new Error('GITHUB_TOKEN is required');
    const request = (path, options) => github(path, { ...options, token });
    // --assert-current: fail when a newer ledger entry exists (a publish step
    // must not run). --report-stale: only report it, for the job that then
    // releases the production head.
    const assertCurrent = process.argv.includes('--assert-current');
    if (assertCurrent || process.argv.includes('--report-stale')) {
      const stale = await isStale({
        request,
        sha: process.env.GITHUB_SHA,
        git: localGit,
      });
      if (process.env.GITHUB_OUTPUT)
        appendFileSync(process.env.GITHUB_OUTPUT, `stale=${stale}\n`);
      if (stale && assertCurrent)
        throw new Error(
          'A newer production commit holds a ledger entry; this run must not publish (a release of the production head follows)'
        );
      console.log(`Release ledger stale for this commit: ${stale}.`);
    } else {
      const reuseOnly = process.argv.includes('--reuse-only');
      const plan = await allocate({
        request,
        sha: process.env.GITHUB_SHA,
        // Resolved from this script so any working directory works.
        pubspec: reuseOnly
          ? undefined
          : readFileSync(
              new URL('../../apps/mobile/pubspec.yaml', import.meta.url),
              'utf8'
            ),
        git: localGit,
        reuseOnly,
      });
      const lines = outputLines(plan);
      console.log(
        plan.action === 'superseded'
          ? `A newer production commit holds ledger build ${plan.latest.build}; this run defers to a release of the production head.`
          : `App release ${platformLabel(plan.entry)} (${plan.action}).`
      );
      if (plan.action !== 'superseded' && process.env.GITHUB_STEP_SUMMARY)
        appendFileSync(
          process.env.GITHUB_STEP_SUMMARY,
          `App release: ${platformLabel(plan.entry)}\n`
        );
      if (process.env.GITHUB_OUTPUT)
        appendFileSync(process.env.GITHUB_OUTPUT, `${lines.join('\n')}\n`);
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
