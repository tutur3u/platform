#!/usr/bin/env node
// Scheduled backstop for review revocation (security-review-sweep.yaml). It
// runs only default-branch code and needs no pull-request-owned workflow, so a
// pull request that deletes or renames the review relay is still recomputed.
//
// 1. Partition (the guarantee). Each hourly run evaluates every open pull
//    request whose number % 24 equals the current UTC hour, so every open
//    pull request is visited once per 24 scheduled runs. No state, cursor or
//    earlier failure can skip a slice. Membership comes from changed paths
//    (the classifier reads the files API); the label is never consulted.
// 2. Fast path (best effort). Afterwards, up to fastPathPulls other pull
//    requests updated since the last successful sweep are evaluated, oldest
//    change first. It cannot starve the partition, which always runs first.
//
// The partition's REST call budget is sized to its slice. A failed or
// over-budget slice fails the run but never blocks a later slice.
const {
  apiCalls,
  github,
  paginate,
  reclassify,
} = require('./security-review-classification.js');

const { env } = process;

const slots = 24;
const maxOpenPulls = 3000;
// Calls one pull request can take: files, live head, reviews, check lookup and
// post, with headroom for a second files or reviews page.
const callsPerPull = 8;
const fastPathPulls = 10;
const workflowPath = '.github/workflows/security-review-sweep.yaml';

const slotOf = (now) => new Date(now).getUTCHours() % slots;

// The slice starts at a different member each UTC day, so a PR that exhausts
// the shared budget cannot starve the same later members of its slot daily.
function rotate(slice, now) {
  if (slice.length === 0) return slice;
  const start = Math.floor(now / (24 * 60 * 60 * 1000)) % slice.length;
  return [...slice.slice(start), ...slice.slice(0, start)];
}

// Start of the last successful scheduled sweep of this workflow file on the
// default branch, or null when it cannot be established.
async function lastSweepStart(repo) {
  const { data: repository, status: repoStatus } = await github(
    `/repos/${repo}`
  );
  const { data: workflow, status: workflowStatus } = await github(
    `/repos/${repo}/actions/workflows/security-review-sweep.yaml`
  );
  const branch = repository?.default_branch;
  if (repoStatus !== 200 || workflowStatus !== 200 || !branch) return null;
  const { data, status } = await github(
    `/repos/${repo}/actions/workflows/security-review-sweep.yaml/runs?branch=${encodeURIComponent(branch)}&event=schedule&status=success&per_page=1`
  );
  const run = status === 200 ? data?.workflow_runs?.[0] : undefined;
  if (
    !run ||
    run.head_branch !== branch ||
    run.workflow_id !== workflow.id ||
    run.path !== workflowPath ||
    run.event !== 'schedule' ||
    run.conclusion !== 'success'
  ) {
    return null;
  }
  const started = Date.parse(run.run_started_at ?? run.created_at ?? '');
  return Number.isFinite(started) ? started : null;
}

async function visit(repo, pull) {
  await reclassify(
    repo,
    {
      author: pull.user?.login ?? '',
      headSha: pull.head?.sha,
      number: String(pull.number),
    },
    // Labels are cosmetic; the sweep never writes them.
    { applyLabels: false, onlyIfChanged: true }
  );
}

async function sweep(repo, { now = Date.now() } = {}) {
  const start = apiCalls.counted;
  const used = () => apiCalls.counted - start;
  const open = await paginate(
    `/repos/${repo}/pulls?state=open&sort=created&direction=asc`,
    maxOpenPulls
  );
  if (!open.complete) {
    throw new Error(`more than ${maxOpenPulls} open pull requests`);
  }
  const pulls = open.items.filter(
    (pull) => pull.base?.repo?.full_name === repo
  );
  const slot = slotOf(now);
  const slice = rotate(
    pulls.filter((pull) => pull.number % slots === slot),
    now
  );
  const budget = used() + slice.length * callsPerPull;
  const counts = { failed: 0, fastPath: 0, overBudget: 0, partition: 0 };

  for (const pull of slice) {
    if (used() >= budget) {
      counts.overBudget += 1;
      console.error(`#${pull.number}: partition call budget exhausted`);
      continue;
    }
    try {
      await visit(repo, pull);
      counts.partition += 1;
    } catch (error) {
      counts.failed += 1;
      console.error(`#${pull.number}: ${error.message}`);
    }
  }

  let since = null;
  try {
    since = await lastSweepStart(repo);
  } catch (error) {
    console.log(`::warning::Fast path skipped: ${error.message}`);
  }
  if (since !== null) {
    const updated = (pull) => Date.parse(pull.updated_at ?? '') || 0;
    const recent = pulls
      .filter((pull) => pull.number % slots !== slot && updated(pull) >= since)
      .sort((a, b) => updated(a) - updated(b) || a.number - b.number)
      .slice(0, fastPathPulls);
    for (const pull of recent) {
      try {
        await visit(repo, pull);
        counts.fastPath += 1;
      } catch (error) {
        counts.failed += 1;
        console.error(`#${pull.number}: ${error.message}`);
      }
    }
  }

  console.log(
    `Slot ${slot}/${slots}: ${slice.length} open pull request(s) in the partition, ${counts.partition} evaluated, ${counts.overBudget} over budget; ${counts.fastPath} fast-path; ${counts.failed} failed; ${used()} API calls.`
  );
  if (counts.failed > 0 || counts.overBudget > 0) {
    throw new Error(
      `${counts.failed} failed and ${counts.overBudget} over-budget pull request(s); later slices are unaffected`
    );
  }
  return { ...counts, calls: used(), slice: slice.length, slot };
}

async function main() {
  const repo = env.GITHUB_REPOSITORY;
  if (!/^[\w.-]+\/[\w.-]+$/u.test(repo ?? '')) {
    throw new Error('bad repository');
  }
  await sweep(repo);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  callsPerPull,
  fastPathPulls,
  main,
  rotate,
  slotOf,
  slots,
  sweep,
};
