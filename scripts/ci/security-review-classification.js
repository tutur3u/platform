#!/usr/bin/env node
// Runs from the default branch in security-review-classifier.yaml
// (pull_request_target) and security-review-reclassify.yaml (workflow_run after
// a review is submitted or dismissed); security-review-sweep.js reuses it for
// the scheduled sweep of labeled open pull requests. It never reads or executes
// pull request content: it lists the PR's file names and current reviews
// through the API, classifies them with the default branch's security-paths.js,
// labels the PR and records a check run.
const fs = require('node:fs');
const { classifyReview, maxListedFiles } = require('./security-paths.js');

const { env } = process;

const label = 'security-review-required';
const checkName = 'Security review';
// Explicit bound; a review listing that does not end inside it is incomplete.
const maxReviews = 1000;
// REST calls made, so callers such as the sweep can enforce a call budget.
const apiCalls = { counted: 0 };

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
  apiCalls.counted += 1;
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
    if (items.length >= limit) {
      return { complete: data.length === 0, items };
    }
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
  const { status } = await github(`/repos/${repo}/check-runs`, {
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
  if (status !== 201) throw new Error(`check-run post failed with ${status}`);
}

async function applyLabel(repo, number) {
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
  const { status } = await github(`/repos/${repo}/issues/${number}/labels`, {
    body: { labels: [label] },
    method: 'POST',
  });
  if (status !== 200) throw new Error(`labeling failed with ${status}`);
}

async function listReviews(repo, number) {
  return paginate(`/repos/${repo}/pulls/${number}/reviews`, maxReviews);
}

// The live head of an open pull request, or null once it is closed.
async function liveHead(repo, number) {
  const { data, status } = await github(`/repos/${repo}/pulls/${number}`);
  if (status !== 200) throw new Error(`pull request lookup failed (${status})`);
  return data?.state === 'open' ? (data.head?.sha ?? null) : null;
}

// Decision input from the pull request's changed paths (never its label).
async function decisionInput(repo, { author, headSha, number }) {
  assertShape(repo, number, headSha);
  const listed = await paginate(
    `/repos/${repo}/pulls/${number}/files`,
    maxListedFiles
  );
  const files = listed.items.flatMap((file) =>
    [file.filename, file.previous_filename].filter(Boolean)
  );
  return {
    author,
    files,
    headSha,
    reviewers: parseReviewers(env.SECURITY_REVIEWERS),
    // GitHub stops listing files at 3000, so a full listing is also truncated.
    truncated: !listed.complete || listed.items.length >= maxListedFiles,
  };
}

function failedDecision() {
  return {
    categories: [],
    conclusion: 'action_required',
    required: true,
    title: 'Security review could not be evaluated; re-run the classifier',
  };
}

// Evaluates one pull request and records the check. Writers for one pull
// request serialize on the repository-wide concurrency group
// security-review-pr-<number>; the sweep cannot, so every writer also re-reads
// the live head and reviews immediately before posting and stays silent when
// the head moved (a newer run owns it). A success therefore always reflects
// the reviews as they were just before the post. Any evaluation error posts
// action_required first; deduplication (sweep only) and labels are
// best-effort and can never suppress that post.
async function reclassify(
  repo,
  pr,
  { applyLabels = true, onlyIfChanged = false } = {}
) {
  assertShape(repo, pr.number, pr.headSha);
  let decision;
  let evaluationError;
  try {
    const input = await decisionInput(repo, pr);
    // Final re-read inside the per-PR boundary, right before the post.
    if ((await liveHead(repo, pr.number)) !== pr.headSha) {
      console.log(
        `#${pr.number}: the head moved or the pull request closed; a newer run classifies it.`
      );
      return { decision: null, posted: false };
    }
    // Reviews are read last and only when a sensitive path changed.
    const { required } = classifyReview(input.files, {
      truncated: input.truncated,
    });
    const reviews = required
      ? await listReviews(repo, pr.number)
      : { complete: true, items: [] };
    decision = decide({
      ...input,
      reviews: reviews.items,
      reviewsComplete: reviews.complete,
    });
  } catch (error) {
    evaluationError = error;
    decision = failedDecision();
  }
  const summary = evaluationError
    ? `### ${decision.title}`
    : summarize(decision);
  let unchanged = false;
  if (onlyIfChanged && !evaluationError) {
    try {
      unchanged =
        (await latestCheckConclusion(repo, pr.headSha)) === decision.conclusion;
    } catch (error) {
      console.log(
        `::warning::#${pr.number}: check lookup failed (${error.message}); posting anyway.`
      );
    }
  }
  if (!unchanged) await postCheck(repo, pr.headSha, decision, summary);
  if (evaluationError) throw evaluationError;
  if (applyLabels && decision.required) {
    try {
      await applyLabel(repo, pr.number);
    } catch (error) {
      console.log(
        `::warning::#${pr.number}: labeling failed (${error.message}); the check was recorded.`
      );
    }
  }
  if (env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(env.GITHUB_STEP_SUMMARY, `${summary}\n`);
  }
  console.log(summary);
  return { decision, posted: !unchanged };
}

async function main() {
  const repo = env.GITHUB_REPOSITORY;
  if (!/^[\w.-]+\/[\w.-]+$/u.test(repo ?? ''))
    throw new Error('bad repository');
  const pr = await target(repo);
  if (env.SECURITY_REVIEW_RESOLVE_ONLY === 'true') {
    // First job of security-review-reclassify.yaml: API-derived identity for
    // the per-PR concurrency group of the job that evaluates and posts.
    if (pr) assertShape(repo, pr.number, pr.headSha);
    const outputs = pr
      ? [
          'found=true',
          `number=${pr.number}`,
          `head_sha=${pr.headSha}`,
          `author=${pr.author}`,
        ]
      : ['found=false'];
    if (env.GITHUB_OUTPUT) {
      fs.appendFileSync(env.GITHUB_OUTPUT, `${outputs.join('\n')}\n`);
    }
    console.log(outputs.join('\n'));
    return;
  }
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
  apiCalls,
  assertShape,
  github,
  main,
  maxReviews,
  paginate,
  reclassify,
  parseReviewers,
  summarize,
};
