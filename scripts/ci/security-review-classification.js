#!/usr/bin/env node
// Runs from the default branch in security-review-classifier.yaml
// (pull_request_target) and security-review-reclassify.yaml (workflow_run after
// a review is submitted or dismissed) and security-review-sweep.yaml (a
// scheduled sweep of labeled open pull requests). It never reads or executes
// pull request content: it lists the PR's file names and current reviews
// through the API, classifies them with the default branch's security-paths.js,
// labels the PR and records a check run.
const fs = require('node:fs');
const { classifyReview, maxListedFiles } = require('./security-paths.js');

const { env } = process;

const label = 'security-review-required';
const checkName = 'Security review';
// Explicit bounds; a listing that does not end inside them is incomplete.
const maxReviews = 1000;
const maxSweptPulls = 200;

function parseReviewers(value) {
  return new Set(
    String(value ?? '')
      .split(/[\s,]+/u)
      .map((login) => login.trim().toLowerCase())
      .filter(Boolean)
  );
}

// Latest review per user decides, recomputed from the live review list on
// every run: a dismissed approval reads back as DISMISSED and stops counting.
// Comments and unsubmitted (PENDING) reviews never change a decision. Only
// approvals of the exact head commit by a configured reviewer who is not the
// author count as independent.
function independentApprovers({ author, headSha, reviews, reviewers }) {
  const latest = new Map();
  for (const review of reviews) {
    const login = review.user?.login?.toLowerCase();
    if (!login || ['COMMENTED', 'PENDING'].includes(review.state)) continue;
    latest.set(login, review);
  }
  return [...latest.entries()]
    .filter(
      ([login, review]) =>
        review.state === 'APPROVED' &&
        review.commit_id === headSha &&
        review.user?.type !== 'Bot' &&
        login !== String(author).toLowerCase() &&
        reviewers.has(login)
    )
    .map(([, review]) => review.user.login)
    .sort();
}

function decide({
  author,
  files,
  headSha,
  reviewers,
  reviews,
  reviewsComplete = false,
  truncated,
}) {
  const classification = classifyReview(files, { truncated });
  if (!classification.required) {
    return {
      ...classification,
      approvers: [],
      conclusion: 'success',
      title: 'No security-sensitive paths changed',
    };
  }
  // Reviews are listed oldest first, so a later change request or dismissal
  // may sit beyond an incomplete listing; never let an earlier approval win.
  if (!reviewsComplete) {
    return {
      ...classification,
      approvers: [],
      conclusion: 'action_required',
      title: `Security review required; the review history exceeds ${maxReviews} reviews or could not be read completely`,
    };
  }
  const approvers = independentApprovers({
    author,
    headSha,
    reviewers,
    reviews,
  });
  if (approvers.length > 0) {
    return {
      ...classification,
      approvers,
      conclusion: 'success',
      title: `Independent security review recorded by ${approvers.join(', ')}`,
    };
  }
  return {
    ...classification,
    approvers,
    conclusion: 'action_required',
    title:
      reviewers.size === 0
        ? 'Security review required; SECURITY_REVIEWERS is not configured'
        : 'Security review required before merge',
  };
}

function summarize(decision) {
  const lines = [`### ${decision.title}`, ''];
  for (const { category, owner, paths } of decision.categories) {
    lines.push(`- **${category}** (owner: ${owner}): ${paths.length} path(s)`);
    for (const filePath of paths.slice(0, 20))
      lines.push(`  - \`${filePath}\``);
    if (paths.length > 20) lines.push(`  - and ${paths.length - 20} more`);
  }
  if (decision.required) {
    lines.push(
      '',
      'An approval of the current head by a configured security reviewer who',
      'is not the author satisfies this check. Submitting or dismissing a',
      'review recomputes it; new commits require a new approval.'
    );
  }
  return lines.join('\n');
}

async function github(path, { method = 'GET', body } = {}) {
  const api = (env.GITHUB_API_URL || 'https://api.github.com').replace(
    /\/$/u,
    ''
  );
  const response = await fetch(`${api}${path}`, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${env.GITHUB_TOKEN}`,
      'x-github-api-version': '2022-11-28',
    },
    method,
  });
  if (!response.ok && response.status !== 404 && response.status !== 422) {
    throw new Error(`${method} ${path} failed with ${response.status}`);
  }
  return {
    data: await response.json().catch(() => null),
    status: response.status,
  };
}

// Reads up to `limit` items. `complete` is true only when the listing ended
// inside the bound (a short page, or an empty probe page past the bound); any
// non-200 or non-array page throws instead of silently truncating.
async function paginate(path, limit) {
  const items = [];
  const separator = path.includes('?') ? '&' : '?';
  for (let page = 1; ; page += 1) {
    const { data, status } = await github(
      `${path}${separator}per_page=100&page=${page}`
    );
    if (status !== 200 || !Array.isArray(data)) {
      throw new Error(`incomplete listing of ${path}`);
    }
    if (items.length >= limit) return { complete: data.length === 0, items };
    items.push(...data);
    if (data.length < 100) return { complete: true, items };
  }
}

// A review relay carries only the head owner, branch and SHA of the reviewed
// pull request. They are lookup keys: the open PR whose live head still matches
// is re-read from the API, so a spoofed signal can only cause an honest
// recomputation. A head that moved on was already reclassified on synchronize.
async function resolveRelayedPullRequest(repo) {
  const owner = env.TRIGGER_HEAD_OWNER ?? '';
  const branch = env.TRIGGER_HEAD_BRANCH ?? '';
  const sha = env.TRIGGER_HEAD_SHA ?? '';
  if (
    !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/u.test(owner) ||
    !branch ||
    branch.length > 255 ||
    !/^[0-9a-f]{40}$/u.test(sha)
  ) {
    throw new Error('bad review relay trigger');
  }
  const head = encodeURIComponent(`${owner}:${branch}`);
  const { data } = await github(
    `/repos/${repo}/pulls?state=open&head=${head}&per_page=100`
  );
  const matches = (Array.isArray(data) ? data : []).filter(
    (pr) => pr.head?.sha === sha && pr.base?.repo?.full_name === repo
  );
  if (matches.length !== 1) return null;
  const [pr] = matches;
  return {
    author: pr.user?.login ?? '',
    headSha: pr.head.sha,
    number: String(pr.number),
  };
}

async function target(repo) {
  if (env.PR_NUMBER) {
    return {
      author: env.PR_AUTHOR,
      headSha: env.HEAD_SHA,
      number: env.PR_NUMBER,
    };
  }
  return resolveRelayedPullRequest(repo);
}

async function latestCheckConclusion(repo, headSha) {
  const { data, status } = await github(
    `/repos/${repo}/commits/${headSha}/check-runs?check_name=${encodeURIComponent(checkName)}&filter=latest&per_page=100`
  );
  if (status !== 200) throw new Error('check-run lookup failed');
  const runs = (data?.check_runs ?? []).filter(
    (run) => run.app?.slug === 'github-actions'
  );
  runs.sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at));
  return runs[0]?.conclusion ?? null;
}

async function postCheck(repo, headSha, decision, summary) {
  await github(`/repos/${repo}/check-runs`, {
    body: {
      conclusion: decision.conclusion,
      details_url: env.RUN_URL,
      head_sha: headSha,
      name: checkName,
      output: { summary, title: decision.title },
      status: 'completed',
    },
    method: 'POST',
  });
}

async function evaluate(repo, { author, headSha, number }) {
  assertShape(repo, number, headSha);
  const listed = await paginate(
    `/repos/${repo}/pulls/${number}/files`,
    maxListedFiles
  );
  const files = listed.items.flatMap((file) =>
    [file.filename, file.previous_filename].filter(Boolean)
  );
  const reviews = await paginate(
    `/repos/${repo}/pulls/${number}/reviews`,
    maxReviews
  );
  return decide({
    author,
    files,
    headSha,
    reviewers: parseReviewers(env.SECURITY_REVIEWERS),
    reviews: reviews.items,
    reviewsComplete: reviews.complete,
    // GitHub stops listing files at 3000, so a full listing is also truncated.
    truncated: !listed.complete || listed.items.length >= maxListedFiles,
  });
}

// Evaluates one pull request and records the check. Any failure after the
// head is known records action_required, so an error can never leave an
// earlier success standing.
async function reclassify(repo, pr, { onlyIfChanged = false } = {}) {
  let decision;
  try {
    decision = await evaluate(repo, pr);
  } catch (error) {
    assertShape(repo, pr.number, pr.headSha);
    const failed = {
      categories: [],
      conclusion: 'action_required',
      required: true,
      title: 'Security review could not be evaluated; re-run the classifier',
    };
    await postCheck(repo, pr.headSha, failed, `### ${failed.title}`);
    throw error;
  }
  if (
    onlyIfChanged &&
    (await latestCheckConclusion(repo, pr.headSha)) === decision.conclusion
  ) {
    return decision;
  }
  const summary = summarize(decision);
  if (decision.required) {
    const existing = await github(`/repos/${repo}/labels/${label}`);
    if (existing.status === 404) {
      await github(`/repos/${repo}/labels`, {
        body: {
          color: 'b60205',
          description: 'Independent security review required before merge',
          name: label,
        },
        method: 'POST',
      });
    }
    await github(`/repos/${repo}/issues/${pr.number}/labels`, {
      body: { labels: [label] },
      method: 'POST',
    });
  }
  await postCheck(repo, pr.headSha, decision, summary);
  if (env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(env.GITHUB_STEP_SUMMARY, `${summary}\n`);
  }
  console.log(summary);
  return decision;
}

// Scheduled backstop that does not depend on any pull-request-owned workflow:
// every open labeled pull request is recomputed from its live reviews, and a
// check is posted only when the decision changed (for example a dismissal the
// review relay never signalled).
async function sweep(repo) {
  const issues = await paginate(
    `/repos/${repo}/issues?state=open&labels=${label}`,
    maxSweptPulls
  );
  if (!issues.complete) {
    console.log(
      `::warning::More than ${maxSweptPulls} labeled pull requests; sweeping the first ${issues.items.length}.`
    );
  }
  let failures = 0;
  for (const issue of issues.items) {
    if (!issue.pull_request) continue;
    const { data, status } = await github(
      `/repos/${repo}/pulls/${issue.number}`
    );
    if (status !== 200 || data?.state !== 'open') continue;
    try {
      await reclassify(
        repo,
        {
          author: data.user?.login ?? '',
          headSha: data.head?.sha,
          number: String(data.number),
        },
        { onlyIfChanged: true }
      );
    } catch (error) {
      failures += 1;
      console.error(`#${issue.number}: ${error.message}`);
    }
  }
  if (failures > 0) throw new Error(`${failures} pull request(s) failed`);
}

async function main() {
  const repo = env.GITHUB_REPOSITORY;
  if (!/^[\w.-]+\/[\w.-]+$/u.test(repo ?? ''))
    throw new Error('bad repository');
  if (env.SECURITY_REVIEW_SWEEP === 'true') {
    await sweep(repo);
    return;
  }
  const pr = await target(repo);
  if (!pr) {
    console.log(
      'No open pull request still has the reviewed head; nothing to reclassify.'
    );
    return;
  }
  await reclassify(repo, pr);
}

function assertShape(repo, number, headSha) {
  if (!/^[\w.-]+\/[\w.-]+$/u.test(repo ?? ''))
    throw new Error('bad repository');
  if (!/^[1-9]\d*$/u.test(number ?? '')) throw new Error('bad PR number');
  if (!/^[0-9a-f]{40}$/u.test(headSha ?? '')) throw new Error('bad head SHA');
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  checkName,
  decide,
  independentApprovers,
  label,
  main,
  maxReviews,
  paginate,
  parseReviewers,
  summarize,
};
