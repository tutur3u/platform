#!/usr/bin/env node

/**
 * Approve the generated release-please pull request, but only while it is
 * still nothing but generated output.
 *
 * The `Protected branches` ruleset requires one approving review, so an
 * untouched release PR otherwise sits at `REVIEW_REQUIRED` forever. This
 * approves it when — and only when — every commit is a release commit by the
 * account that opened the PR, and every changed file is one release-please
 * itself rewrites, derived from release-please-config.json.
 *
 * Anything unexpected is a skip, not a failure: the release PR still exists and
 * a human can review it normally.
 *
 * Usage:
 *   node scripts/ci/release-please-auto-approve.js --target-branch production
 */

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const {
  DEFAULT_APPROVED_AUTHORS,
  RELEASE_BRANCH_PREFIX,
  buildAllowedPaths,
  evaluateReleasePullRequest,
} = require('./release-please-auto-approve-core.js');

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const DEFAULT_TARGET_BRANCH = 'production';
const DEFAULT_CONFIG_FILE = 'release-please-config.json';
const SELF_APPROVAL_MESSAGE = 'can not approve your own pull request';

function parseArgs(argv) {
  const args = {
    configFile: DEFAULT_CONFIG_FILE,
    targetBranch: DEFAULT_TARGET_BRANCH,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === '--target-branch') {
      args.targetBranch = next;
      index += 1;
      continue;
    }

    if (arg === '--config-file') {
      args.configFile = next;
      index += 1;
      continue;
    }

    if (arg === '--repository') {
      args.repository = next;
      index += 1;
      continue;
    }

    if (arg === '--dry-run') {
      args.dryRun = true;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function parseApprovedAuthors(value) {
  if (!value) return DEFAULT_APPROVED_AUTHORS;

  const logins = value
    .split(',')
    .map((login) => login.trim())
    .filter(Boolean);

  return logins.length > 0 ? logins : DEFAULT_APPROVED_AUTHORS;
}

class GitHubClient {
  constructor({ apiUrl, repository, token }) {
    this.apiUrl = (apiUrl || 'https://api.github.com').replace(/\/$/u, '');
    this.repository = repository;
    this.token = token;
  }

  async request(method, route, { body, query } = {}) {
    const url = new URL(
      `${this.apiUrl}/repos/${this.repository}/${route.replace(/^\//u, '')}`
    );

    for (const [key, value] of Object.entries(query || {})) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    }

    const response = await fetch(url, {
      body: body ? JSON.stringify(body) : undefined,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      method,
    });

    const text = await response.text();
    const data = text ? JSON.parse(text) : undefined;

    if (!response.ok) {
      const error = new Error(
        data?.message || `GitHub API request failed: ${method} ${route}`
      );
      error.status = response.status;
      error.data = data;
      throw error;
    }

    return data;
  }

  async findReleasePullRequest(targetBranch) {
    const pulls = await this.request('GET', '/pulls', {
      query: {
        base: targetBranch,
        head: `${this.repository.split('/')[0]}:${RELEASE_BRANCH_PREFIX}${targetBranch}`,
        per_page: 1,
        state: 'open',
      },
    });

    return pulls?.[0];
  }

  async listAll(route, number) {
    const items = [];

    for (let page = 1; page <= 10; page += 1) {
      const pageItems = await this.request('GET', `/pulls/${number}/${route}`, {
        query: { page, per_page: 100 },
      });

      items.push(...pageItems);
      if (pageItems.length < 100) break;
    }

    return items;
  }

  async listReviews(number) {
    return this.listAll('reviews', number);
  }

  async approve(number, body) {
    return this.request('POST', `/pulls/${number}/reviews`, {
      body: { body, event: 'APPROVE' },
    });
  }
}

function resolveToken() {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  if (process.env.GH_TOKEN) return process.env.GH_TOKEN;

  try {
    return execFileSync('gh', ['auth', 'token'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return undefined;
  }
}

function hasCurrentApproval(reviews, headSha) {
  return (reviews || []).some(
    (review) => review.state === 'APPROVED' && review.commit_id === headSha
  );
}

async function autoApproveReleasePullRequest({
  approvedAuthors,
  config,
  dryRun = false,
  github,
  targetBranch,
}) {
  const pullRequest = await github.findReleasePullRequest(targetBranch);

  if (!pullRequest) {
    return { reason: 'no open release-please pull request', status: 'skipped' };
  }

  const [commits, files] = await Promise.all([
    github.listAll('commits', pullRequest.number),
    github.listAll('files', pullRequest.number),
  ]);

  const decision = evaluateReleasePullRequest({
    allowedPaths: buildAllowedPaths(config),
    approvedAuthors,
    commits,
    files,
    pullRequest,
    targetBranch,
  });

  if (!decision.approve) {
    return {
      number: pullRequest.number,
      reason: decision.reason,
      status: 'skipped',
    };
  }

  if (dryRun) {
    return {
      number: pullRequest.number,
      reason: `would approve: ${decision.reason}`,
      status: 'dry-run',
    };
  }

  const reviews = await github.listReviews(pullRequest.number);

  if (hasCurrentApproval(reviews, pullRequest.head.sha)) {
    return {
      number: pullRequest.number,
      reason: 'already approved at the current head',
      status: 'unchanged',
    };
  }

  try {
    await github.approve(
      pullRequest.number,
      'Approved automatically: this release pull request contains only release-please generated version and changelog updates.'
    );
  } catch (error) {
    // GitHub refuses a review by the account that opened the PR. That is what
    // happens while RELEASE_PLEASE_TOKEN is unset and both the PR and this job
    // run as github-actions[bot]. The release itself is fine, so report it and
    // leave the run green.
    if (
      error.status === 422 &&
      String(error.message).toLowerCase().includes(SELF_APPROVAL_MESSAGE)
    ) {
      return {
        number: pullRequest.number,
        reason:
          'the release pull request was opened by this same identity; set RELEASE_PLEASE_TOKEN so release-please and the approval run as different accounts',
        status: 'blocked',
      };
    }

    throw error;
  }

  return {
    number: pullRequest.number,
    reason: decision.reason,
    status: 'approved',
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const repository = args.repository || process.env.GITHUB_REPOSITORY;
  const token = resolveToken();

  if (!repository) throw new Error('GITHUB_REPOSITORY is required');
  if (!token) throw new Error('GITHUB_TOKEN or GH_TOKEN is required');

  const config = JSON.parse(
    fs.readFileSync(path.join(ROOT_DIR, args.configFile), 'utf8')
  );

  const result = await autoApproveReleasePullRequest({
    approvedAuthors: parseApprovedAuthors(process.env.RELEASE_PLEASE_AUTHORS),
    config,
    dryRun: args.dryRun,
    github: new GitHubClient({
      apiUrl: process.env.GITHUB_API_URL,
      repository,
      token,
    }),
    targetBranch: args.targetBranch,
  });

  const label = result.number ? `PR #${result.number}` : 'release PR';

  console.log(`Release Please auto approve: ${result.status} (${label})`);
  console.log(`Reason: ${result.reason}`);

  if (result.status === 'blocked') {
    console.log(
      `::warning::Release PR #${result.number} was not approved: ${result.reason}`
    );
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = {
  GitHubClient,
  autoApproveReleasePullRequest,
  hasCurrentApproval,
  parseApprovedAuthors,
  parseArgs,
  resolveToken,
};
