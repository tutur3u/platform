#!/usr/bin/env node
// Large documentation deletions need an explicit marker.
//
// A commit that deletes more than DELETION_LIMIT lines from a single file under
// apps/docs/ fails unless its message carries a trailer naming that file:
//
//   Docs-Deletion: apps/docs/path/to/page.mdx
//
// Usage:
//   node scripts/check-docs-deletions.js --base <ref>      # commits <ref>..HEAD
//   node scripts/check-docs-deletions.js --range <a>..<b>  # commits in a range
//   node scripts/check-docs-deletions.js --commit <sha>    # one commit
const { execFileSync } = require('node:child_process');

const DELETION_LIMIT = 500;
const DOCS_PREFIX = 'apps/docs/';
const MARKER = 'Docs-Deletion';
// `git hash-object -t tree /dev/null`: the parent of a root commit.
const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

function git(args, execFile = execFileSync) {
  return execFile('git', args, {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
}

function parseArgs(argv) {
  const options = { base: null, range: null, commit: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (!['--base', '--range', '--commit'].includes(arg) || !value)
      throw new Error(`Unknown or incomplete argument: ${arg}`);
    options[arg.slice(2)] = value;
    index += 1;
  }
  const chosen = [options.base, options.range, options.commit].filter(Boolean);
  if (chosen.length !== 1)
    throw new Error('Pass exactly one of --base, --range or --commit.');
  return options;
}

// Every commit in the range is checked, merges included; ranges are short (a
// push or a local branch). commitDeletions decides what a merge counts.
function listCommits(options, execFile) {
  if (options.commit) return [options.commit];
  const range = options.range ?? `${options.base}..HEAD`;
  return git(['rev-list', range], execFile)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

// `--numstat -z` prints "<added>\t<deleted>\t<path>\0", or for a rename
// "<added>\t<deleted>\t\0<old>\0<new>\0"; binary files print "-". Renames are
// detected, so moving a page is not a deletion, and a renamed page that also
// loses many lines is reported under its new path.
function largeDocsDeletions(numstat) {
  const found = [];
  const fields = numstat.split('\0');
  for (let index = 0; index < fields.length; index += 1) {
    const match = /^(?:\n)?(-|\d+)\t(-|\d+)\t(.*)$/s.exec(fields[index]);
    if (!match) continue;
    let paths = [match[3]];
    if (match[3] === '') {
      paths = [fields[index + 1], fields[index + 2]];
      index += 2;
    }
    const deleted = match[2] === '-' ? 0 : Number(match[2]);
    if (
      deleted > DELETION_LIMIT &&
      paths.some((path) => path?.startsWith(DOCS_PREFIX))
    )
      found.push({ path: paths.at(-1), deleted });
  }
  return found;
}

function markedPaths(message) {
  const marked = new Set();
  const pattern = new RegExp(`^${MARKER}:[ \\t]*(\\S+)[ \\t]*$`, 'gm');
  for (const match of message.matchAll(pattern)) marked.add(match[1]);
  return marked;
}

// A merge only counts content it drops against every parent, as a conflict
// resolution does; a deletion one branch already made and marked is not
// counted again on the merge.
function commitDeletions(sha, execFile) {
  const parents = git(['rev-list', '--parents', '-n', '1', sha], execFile)
    .trim()
    .split(/\s+/)
    .slice(1);
  const numstat = (args) =>
    largeDocsDeletions(
      git(['diff', '--numstat', '-z', '-M', ...args], execFile)
    );
  if (parents.length <= 1) return numstat([parents[0] ?? EMPTY_TREE, sha]);
  const perParent = parents.map((parent) => numstat([parent, sha]));
  return perParent[0]
    .map(({ path, deleted }) => ({
      path,
      deleted: Math.min(
        deleted,
        ...perParent
          .slice(1)
          .map(
            (list) => list.find((entry) => entry.path === path)?.deleted ?? 0
          )
      ),
    }))
    .filter(({ deleted }) => deleted > DELETION_LIMIT);
}

function checkCommit(sha, execFile) {
  const message = git(['show', '-s', '--format=%B', sha], execFile);
  const marked = markedPaths(message);
  return commitDeletions(sha, execFile)
    .filter(({ path }) => !marked.has(path))
    .map((entry) => ({ sha, ...entry }));
}

function main(argv = process.argv.slice(2), execFile = execFileSync) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    console.error(`check-docs-deletions: ${error.message}`);
    return 64;
  }
  const violations = listCommits(options, execFile).flatMap((sha) =>
    checkCommit(sha, execFile)
  );
  if (violations.length === 0) {
    console.log('check-docs-deletions: no unmarked large docs deletions.');
    return 0;
  }
  for (const { sha, path, deleted } of violations)
    console.error(
      `${sha.slice(0, 10)} deletes ${deleted} lines from ${path} (limit ${DELETION_LIMIT}).`
    );
  console.error(
    `Split the change, or confirm the deletion is intended and add a "${MARKER}: <path>" trailer for each file to the commit message.`
  );
  return 1;
}

if (require.main === module) process.exitCode = main();

module.exports = {
  DELETION_LIMIT,
  largeDocsDeletions,
  main,
  markedPaths,
  parseArgs,
};
