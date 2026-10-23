#!/usr/bin/env node
// Runs in security-review-classifier.yaml (pull_request_target) from the
// default branch. It never reads or executes pull request content: it lists
// the PR's file names through the API, classifies them with the default
// branch's security-paths.js, labels the PR and records a check run.
const fs = require('node:fs');
const { classifyReview, maxListedFiles } = require('./security-paths.js');

const { env } = process;

const label = 'security-review-required';
const checkName = 'Security review';

function parseReviewers(value) {
  return new Set(
    String(value ?? '')
      .split(/[\s,]+/u)
      .map((login) => login.trim().toLowerCase())
      .filter(Boolean)
  );
}

// Latest review per user decides; only approvals of the exact head commit by a
// configured reviewer who is not the author count as independent.
function independentApprovers({ author, headSha, reviewers, reviews }) {
  const latest = new Map();
  for (const review of reviews) {
    const login = review.user?.login?.toLowerCase();
    if (!login || review.state === 'COMMENTED') continue;
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

function decide({ author, files, headSha, reviewers, reviews, truncated }) {
  const classification = classifyReview(files, { truncated });
  if (!classification.required) {
    return {
      ...classification,
      approvers: [],
      conclusion: 'success',
      title: 'No security-sensitive paths changed',
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
      'is not the author satisfies this check. Re-run this workflow after the',
      'review; new commits require a new approval.'
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

async function paginate(path, limit) {
  const items = [];
  for (let page = 1; items.length < limit; page += 1) {
    const { data } = await github(`${path}?per_page=100&page=${page}`);
    if (!Array.isArray(data) || data.length === 0) break;
    items.push(...data);
    if (data.length < 100) break;
  }
  return items;
}

async function main() {
  const repo = env.GITHUB_REPOSITORY;
  const number = env.PR_NUMBER;
  const headSha = env.HEAD_SHA;
  assertShape(repo, number, headSha);
  const listed = await paginate(
    `/repos/${repo}/pulls/${number}/files`,
    maxListedFiles
  );
  const files = listed.flatMap((file) =>
    [file.filename, file.previous_filename].filter(Boolean)
  );
  const reviews = await paginate(
    `/repos/${repo}/pulls/${number}/reviews`,
    1000
  );
  const decision = decide({
    author: env.PR_AUTHOR,
    files,
    headSha,
    reviewers: parseReviewers(env.SECURITY_REVIEWERS),
    reviews,
    truncated: listed.length >= maxListedFiles,
  });
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
    await github(`/repos/${repo}/issues/${number}/labels`, {
      body: { labels: [label] },
      method: 'POST',
    });
  }
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
  if (env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(env.GITHUB_STEP_SUMMARY, `${summary}\n`);
  }
  console.log(summary);
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
  parseReviewers,
  summarize,
};
