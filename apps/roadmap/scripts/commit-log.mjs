/**
 * Reads commits to main from the build checkout's own git history for the
 * roadmap's commit metrics (packages/roadmap-core/src/insights/commits.ts).
 * No network and no token: the build job checks out full history without
 * blobs. Returns null when the checkout is shallow or git is unavailable, so
 * the page shows the figures as not available instead of a partial count.
 */
import { spawnSync } from 'node:child_process';
import { isNoiseCommit } from '@tuturuuu/roadmap-core/insights/commits.ts';

const RECORD = '\x1e';
const FIELD = '\x1f';
const SHA = /^[a-f0-9]{40}$/;
const MAX_BUFFER = 256 * 1024 * 1024;

function git(args, cwd) {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: MAX_BUFFER,
  });
  if (result.status !== 0) {
    throw new Error(
      `git ${args[0]} failed: ${(result.stderr || '').trim().split('\n')[0]}`
    );
  }
  return result.stdout;
}

function exists(ref, cwd) {
  return (
    spawnSync('git', ['cat-file', '-e', `${ref}^{commit}`], { cwd }).status ===
    0
  );
}

/** Parse `git log --format=<RECORD>sha<FIELD>…<FIELD>subject --name-only`. */
export function parseLog(output) {
  return output
    .split(RECORD)
    .filter((chunk) => chunk.trim())
    .flatMap((chunk) => {
      const [header, ...rest] = chunk.split('\n');
      const [sha, at, authorName, authorEmail, subject] = header.split(FIELD);
      if (!SHA.test(sha ?? '') || subject === undefined) return [];
      const files = rest.map((line) => line.trim()).filter(Boolean);
      return [{ sha, at, authorName, authorEmail, subject, files }];
    });
}

const FORMAT = `--format=${RECORD}%H${FIELD}%cI${FIELD}%an${FIELD}%ae${FIELD}%s`;

/**
 * First-parent commits on `head` since `sinceMs`, each marked in production
 * when the production branch or any observed production build contains it,
 * and the production branch's lag behind `head`.
 */
export function readCommits({
  cwd,
  head = 'HEAD',
  productionRef = 'origin/production',
  deployCommits = [],
  sinceMs,
}) {
  if (git(['rev-parse', '--is-shallow-repository'], cwd).trim() === 'true')
    throw new Error('shallow checkout: commit history is not available');
  const since = `--since=@${Math.floor(sinceMs / 1000)}`;
  const log = parseLog(
    git(
      [
        'log',
        '--first-parent',
        '--diff-merges=first-parent',
        // Rename detection would fetch file contents in a blob-less clone.
        '--no-renames',
        '--name-only',
        since,
        FORMAT,
        head,
      ],
      cwd
    )
  );
  const productionTargets = [
    ...(exists(productionRef, cwd) ? [productionRef] : []),
    ...deployCommits.filter((sha) => SHA.test(sha) && exists(sha, cwd)),
  ];
  const shipped = new Set();
  for (const target of new Set(productionTargets))
    for (const sha of git(['rev-list', since, target], cwd).split('\n'))
      if (sha) shipped.add(sha);
  const commits = log.map((commit) => ({
    ...commit,
    inProduction: shipped.has(commit.sha),
  }));
  let production = null;
  if (exists(productionRef, cwd)) {
    const commit = git(['rev-parse', productionRef], cwd).trim();
    const waiting = parseLog(
      git(['log', '--first-parent', FORMAT, `${productionRef}..${head}`], cwd)
    ).filter((entry) => !isNoiseCommit(entry));
    production = {
      commit,
      waiting: waiting.length,
      oldestWaitingAt: waiting.at(-1)?.at ?? null,
    };
  }
  return { commits, production };
}

/**
 * The commits curated deliverables cite (live/evidence.ts), whatever their
 * age: each one on `head`'s history and, where this checkout has it, on the
 * main branch (a pull-request build's synthetic merge also contains the
 * request's own commits), with its committer time. `head` is the commit the
 * history was read from. Cited commits not found are left out (no evidence).
 */
export function readCitedCommits({
  cwd,
  cited,
  head = 'HEAD',
  mainRef = 'origin/main',
}) {
  if (git(['rev-parse', '--is-shallow-repository'], cwd).trim() === 'true')
    throw new Error('shallow checkout: commit history is not available');
  const targets = [head, ...(exists(mainRef, cwd) ? [mainRef] : [])];
  const onMain = [...new Set(cited)].filter(
    (sha) =>
      SHA.test(sha) &&
      exists(sha, cwd) &&
      targets.every(
        (target) =>
          spawnSync('git', ['merge-base', '--is-ancestor', sha, target], {
            cwd,
          }).status === 0
      )
  );
  const source = git(['rev-parse', `${head}^{commit}`], cwd).trim();
  if (!onMain.length) return { head: source, commits: [] };
  const times = new Map(
    git(['show', '-s', `--format=%H${FIELD}%cI`, ...onMain], cwd)
      .split('\n')
      .filter(Boolean)
      .map((line) => line.split(FIELD))
  );
  return {
    head: source,
    commits: onMain.flatMap((sha) => {
      const at = times.get(sha);
      return at ? [{ sha, at }] : [];
    }),
  };
}
