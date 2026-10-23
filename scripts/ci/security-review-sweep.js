#!/usr/bin/env node
// Scheduled backstop for review revocation (security-review-sweep.yaml). It
// runs only default-branch code and needs no pull-request-owned workflow, so a
// pull request that deletes or renames the review relay still gets
// recomputed. It is incremental, bounded and keeps no state of its own:
// - open pull requests are listed (pull requests only, never plain issues)
//   and filtered to the security-review-required label;
// - the cursor is the start of the last successful scheduled sweep, read from
//   GitHub's run history. Pull requests updated since then (pushes, reviews,
//   labels, comments) are evaluated, oldest change first;
// - every other labeled pull request is re-evaluated once per rotationSlots
//   hourly slots (by number), so a change that does not move updated_at is
//   still caught;
// - counted REST calls stop at SWEEP_CALL_BUDGET. Work left over fails the
//   run, so the cursor does not advance and the backlog leads the next run.
const {
  apiCalls,
  github,
  label,
  paginate,
  reclassify,
} = require('./security-review-classification.js');

const { env } = process;

const maxOpenPulls = 3000;
const rotationSlots = 24;
const hourMs = 60 * 60 * 1000;
const defaultBudget = 300;
const workflowFile = 'security-review-sweep.yaml';

function isLabeled(pull) {
  return (pull.labels ?? []).some((item) => item?.name === label);
}

// Start of the last successful scheduled sweep on the default branch, or 0
// (evaluate everything) when there is none or it cannot be read.
async function lastSweepStart(repo) {
  const { data, status } = await github(
    `/repos/${repo}/actions/workflows/${workflowFile}/runs?event=schedule&status=success&per_page=1`
  );
  const run = status === 200 ? data?.workflow_runs?.[0] : undefined;
  const started = Date.parse(run?.run_started_at ?? run?.created_at ?? '');
  return Number.isFinite(started) ? started : 0;
}

async function sweep(repo, { budget = defaultBudget, now = Date.now() } = {}) {
  const start = apiCalls.counted;
  const used = () => apiCalls.counted - start;
  const since = await lastSweepStart(repo);
  const open = await paginate(
    `/repos/${repo}/pulls?state=open&sort=created&direction=asc`,
    maxOpenPulls
  );
  if (!open.complete) {
    throw new Error(`more than ${maxOpenPulls} open pull requests`);
  }
  const labeled = open.items.filter(
    (pull) => isLabeled(pull) && pull.base?.repo?.full_name === repo
  );
  const slot = Math.floor(now / hourMs) % rotationSlots;
  const updated = (pull) => Date.parse(pull.updated_at ?? '') || 0;
  const changed = labeled
    .filter((pull) => updated(pull) >= since)
    .sort((a, b) => updated(a) - updated(b) || a.number - b.number);
  const rotated = labeled.filter(
    (pull) => updated(pull) < since && pull.number % rotationSlots === slot
  );

  const counts = { changed: 0, deferred: 0, failed: 0, rotated: 0 };
  for (const [kind, pulls] of [
    ['changed', changed],
    ['rotated', rotated],
  ]) {
    for (const pull of pulls) {
      if (used() >= budget) {
        counts.deferred += 1;
        continue;
      }
      try {
        await reclassify(
          repo,
          {
            author: pull.user?.login ?? '',
            headSha: pull.head?.sha,
            number: String(pull.number),
          },
          // Swept pull requests are already labeled; never write labels here.
          { applyLabels: false, onlyIfChanged: true }
        );
        counts[kind] += 1;
      } catch (error) {
        counts.failed += 1;
        console.error(`#${pull.number}: ${error.message}`);
      }
    }
  }
  console.log(
    `Swept ${labeled.length} labeled pull request(s) (slot ${slot}/${rotationSlots}): ${counts.changed} changed, ${counts.rotated} rotated, ${counts.deferred} deferred, ${counts.failed} failed; ${used()} counted API calls (budget ${budget}).`
  );
  if (counts.deferred > 0 || counts.failed > 0) {
    // A failed run leaves the cursor where it was, so nothing is skipped.
    throw new Error(
      `${counts.deferred} deferred and ${counts.failed} failed pull request(s); the next run resumes from the previous cursor`
    );
  }
  return { ...counts, calls: used(), slot };
}

async function main() {
  const repo = env.GITHUB_REPOSITORY;
  if (!/^[\w.-]+\/[\w.-]+$/u.test(repo ?? '')) {
    throw new Error('bad repository');
  }
  const budget = Number(env.SWEEP_CALL_BUDGET ?? defaultBudget);
  if (!Number.isSafeInteger(budget) || budget < 1) {
    throw new Error('bad SWEEP_CALL_BUDGET');
  }
  await sweep(repo, { budget });
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { hourMs, main, rotationSlots, sweep };
