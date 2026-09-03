import 'server-only';

import { cacheLife, cacheTag } from 'next/cache';
import { githubRequest, githubRequestWithMetadata } from './api';
import { requireRegisteredRepository } from './registry';
import type {
  GitHubCommit,
  GitHubContent,
  GitHubContributor,
  GitHubIssue,
  GitHubIssueComment,
  GitHubPage,
  GitHubPullFile,
  GitHubPullRequest,
  GitHubPullReview,
  GitHubRelease,
  GitHubRepository,
  GitHubWorkflowArtifact,
  GitHubWorkflowJob,
  GitHubWorkflowRun,
  RepositoryOverview,
} from './types';

function mutableCache(owner: string, name: string, resource: string) {
  cacheLife({ expire: 300, revalidate: 30, stale: 30 });
  cacheTag(
    `git:${owner.toLowerCase()}/${name.toLowerCase()}`,
    `git:${resource}`
  );
}

function metadataCache(owner: string, name: string, resource: string) {
  cacheLife({ expire: 3600, revalidate: 300, stale: 300 });
  cacheTag(
    `git:${owner.toLowerCase()}/${name.toLowerCase()}`,
    `git:${resource}`
  );
}

export async function getRepositoryOverview(
  owner: string,
  name: string
): Promise<RepositoryOverview> {
  'use cache';
  metadataCache(owner, name, 'overview');
  const repository = await requireRegisteredRepository(owner, name);
  const [metadata, languages, readme, rootContent] = await Promise.all([
    githubRequest<GitHubRepository>({ path: '', repository }),
    githubRequest<Record<string, number>>({
      path: '/languages',
      repository,
    }),
    githubRequest<{ content?: string; path: string }>({
      path: '/readme',
      repository,
    }).catch(() => null),
    githubRequest<GitHubContent[]>({
      path: '/contents',
      repository,
    }),
  ]);

  return {
    languages,
    readme: readme?.content
      ? {
          content: Buffer.from(
            readme.content.replaceAll('\n', ''),
            'base64'
          ).toString('utf8'),
          path: readme.path,
        }
      : null,
    repository: metadata,
    rootContent,
  };
}

export async function getRepositoryMetadata(owner: string, name: string) {
  'use cache';
  metadataCache(owner, name, 'metadata');
  const repository = await requireRegisteredRepository(owner, name);
  return githubRequest<GitHubRepository>({ path: '', repository });
}

export async function getRepositoryContent(
  owner: string,
  name: string,
  path: string,
  ref?: string
) {
  'use cache';
  metadataCache(owner, name, `content:${ref ?? 'default'}:${path}`);
  const repository = await requireRegisteredRepository(owner, name);
  return githubRequest<GitHubContent | GitHubContent[]>({
    path: `/contents/${path}`,
    query: { ref },
    repository,
  });
}

export async function getRepositoryCommits(
  owner: string,
  name: string,
  page = 1
) {
  'use cache';
  mutableCache(owner, name, `commits:${page}`);
  const repository = await requireRegisteredRepository(owner, name);
  return githubRequest<GitHubCommit[]>({
    path: '/commits',
    query: { page, per_page: 50 },
    repository,
  });
}

export async function getRepositoryIssues(
  owner: string,
  name: string,
  page = 1
) {
  'use cache';
  mutableCache(owner, name, `issues:${page}`);
  const repository = await requireRegisteredRepository(owner, name);
  const issues = await githubRequest<GitHubIssue[]>({
    path: '/issues',
    query: { page, per_page: 50, state: 'all' },
    repository,
  });
  return issues.filter((issue) => !issue.pull_request);
}

export async function getRepositoryPulls(
  owner: string,
  name: string,
  page = 1
) {
  'use cache';
  mutableCache(owner, name, `pulls:${page}`);
  const repository = await requireRegisteredRepository(owner, name);
  return githubRequest<GitHubPullRequest[]>({
    path: '/pulls',
    query: { page, per_page: 50, state: 'all' },
    repository,
  });
}

export async function getRepositoryReleases(
  owner: string,
  name: string,
  page = 1
) {
  'use cache';
  mutableCache(owner, name, `releases:${page}`);
  const repository = await requireRegisteredRepository(owner, name);
  return githubRequest<GitHubRelease[]>({
    path: '/releases',
    query: { page, per_page: 30 },
    repository,
  });
}

export async function getRepositoryActions(
  owner: string,
  name: string,
  page = 1
) {
  'use cache';
  mutableCache(owner, name, `actions:${page}`);
  const repository = await requireRegisteredRepository(owner, name);
  const result = await githubRequest<{ workflow_runs: GitHubWorkflowRun[] }>({
    path: '/actions/runs',
    query: { page, per_page: 50 },
    repository,
  });
  return result.workflow_runs;
}

export async function getRepositoryActionRun(
  owner: string,
  name: string,
  runId: number
) {
  'use cache';
  mutableCache(owner, name, `action:${runId}`);
  const repository = await requireRegisteredRepository(owner, name);
  return githubRequest<GitHubWorkflowRun>({
    path: `/actions/runs/${runId}`,
    repository,
  });
}

export async function getRepositoryActionRunJobs(
  owner: string,
  name: string,
  runId: number,
  page: number
): Promise<GitHubPage<GitHubWorkflowJob>> {
  'use cache';
  mutableCache(owner, name, `action:${runId}:jobs:${page}`);
  const repository = await requireRegisteredRepository(owner, name);
  const result = await githubRequestWithMetadata<{
    jobs: GitHubWorkflowJob[];
  }>({
    path: `/actions/runs/${runId}/jobs`,
    query: { page, per_page: 50 },
    repository,
  });
  return {
    items: result.body.jobs,
    nextPage: result.hasNextPage ? page + 1 : null,
  };
}

export async function getRepositoryActionRunArtifacts(
  owner: string,
  name: string,
  runId: number,
  page: number
): Promise<GitHubPage<GitHubWorkflowArtifact>> {
  'use cache';
  mutableCache(owner, name, `action:${runId}:artifacts:${page}`);
  const repository = await requireRegisteredRepository(owner, name);
  const result = await githubRequestWithMetadata<{
    artifacts: GitHubWorkflowArtifact[];
  }>({
    path: `/actions/runs/${runId}/artifacts`,
    query: { page, per_page: 50 },
    repository,
  });
  return {
    items: result.body.artifacts,
    nextPage: result.hasNextPage ? page + 1 : null,
  };
}

export async function getRepositoryContributors(
  owner: string,
  name: string,
  page = 1
) {
  'use cache';
  metadataCache(owner, name, `contributors:${page}`);
  const repository = await requireRegisteredRepository(owner, name);
  return githubRequest<GitHubContributor[]>({
    path: '/contributors',
    query: { page, per_page: 50 },
    repository,
  });
}

export async function getRepositoryBranches(owner: string, name: string) {
  'use cache';
  mutableCache(owner, name, 'branches');
  const repository = await requireRegisteredRepository(owner, name);
  return githubRequest<Array<{ name: string; commit: { sha: string } }>>({
    path: '/branches',
    query: { per_page: 100 },
    repository,
  });
}

export async function getRepositoryTags(owner: string, name: string) {
  'use cache';
  mutableCache(owner, name, 'tags');
  const repository = await requireRegisteredRepository(owner, name);
  return githubRequest<Array<{ name: string; commit: { sha: string } }>>({
    path: '/tags',
    query: { per_page: 100 },
    repository,
  });
}

export async function getRepositoryIssue(
  owner: string,
  name: string,
  number: number
) {
  'use cache';
  mutableCache(owner, name, `issue:${number}`);
  const repository = await requireRegisteredRepository(owner, name);
  return githubRequest<
    GitHubIssue & { body: string | null; closed_at: string | null }
  >({ path: `/issues/${number}`, repository });
}

export async function getRepositoryIssueComments(
  owner: string,
  name: string,
  number: number,
  page: number
): Promise<GitHubPage<GitHubIssueComment>> {
  'use cache';
  mutableCache(owner, name, `issue:${number}:comments:${page}`);
  const repository = await requireRegisteredRepository(owner, name);
  return pagedArrayRequest({
    page,
    path: `/issues/${number}/comments`,
    perPage: 50,
    repository,
  });
}

export async function getRepositoryPull(
  owner: string,
  name: string,
  number: number
) {
  'use cache';
  mutableCache(owner, name, `pull:${number}`);
  const repository = await requireRegisteredRepository(owner, name);
  return githubRequest<
    GitHubPullRequest & {
      body: string | null;
      commits: number;
      additions: number;
      deletions: number;
      changed_files: number;
    }
  >({ path: `/pulls/${number}`, repository });
}

export async function getRepositoryPullFiles(
  owner: string,
  name: string,
  number: number,
  page: number
): Promise<GitHubPage<GitHubPullFile>> {
  'use cache';
  mutableCache(owner, name, `pull:${number}:files:${page}`);
  const repository = await requireRegisteredRepository(owner, name);
  return pagedArrayRequest({
    page,
    path: `/pulls/${number}/files`,
    perPage: 100,
    repository,
  });
}

export async function getRepositoryPullReviews(
  owner: string,
  name: string,
  number: number,
  page: number
): Promise<GitHubPage<GitHubPullReview>> {
  'use cache';
  mutableCache(owner, name, `pull:${number}:reviews:${page}`);
  const repository = await requireRegisteredRepository(owner, name);
  return pagedArrayRequest({
    page,
    path: `/pulls/${number}/reviews`,
    perPage: 50,
    repository,
  });
}

async function pagedArrayRequest<T>({
  page,
  path,
  perPage,
  repository,
}: {
  page: number;
  path: string;
  perPage: number;
  repository: Awaited<ReturnType<typeof requireRegisteredRepository>>;
}): Promise<GitHubPage<T>> {
  const result = await githubRequestWithMetadata<T[]>({
    path,
    query: { page, per_page: perPage },
    repository,
  });
  return {
    items: result.body,
    nextPage: result.hasNextPage ? page + 1 : null,
  };
}

export async function getRepositoryCommit(
  owner: string,
  name: string,
  sha: string
) {
  'use cache';
  cacheLife({ expire: 31_536_000, revalidate: 31_536_000, stale: 31_536_000 });
  cacheTag(
    `git:${owner.toLowerCase()}/${name.toLowerCase()}`,
    `git:commit:${sha}`
  );
  const repository = await requireRegisteredRepository(owner, name);
  const [commit, checks, statuses] = await Promise.all([
    githubRequest<
      GitHubCommit & {
        files?: Array<{
          additions: number;
          changes: number;
          deletions: number;
          filename: string;
          patch?: string;
          status: string;
        }>;
        stats: { additions: number; deletions: number; total: number };
      }
    >({ path: `/commits/${encodeURIComponent(sha)}`, repository }),
    githubRequest<{
      check_runs: Array<{
        conclusion: string | null;
        html_url: string;
        id: number;
        name: string;
        status: string;
      }>;
    }>({
      path: `/commits/${encodeURIComponent(sha)}/check-runs`,
      repository,
    }).catch(() => ({ check_runs: [] })),
    githubRequest<{
      state: string;
      statuses: Array<{
        context: string;
        description: string | null;
        id: number;
        state: string;
        target_url: string | null;
      }>;
    }>({
      path: `/commits/${encodeURIComponent(sha)}/status`,
      repository,
    }).catch(() => ({ state: 'unknown', statuses: [] })),
  ]);

  return {
    ...commit,
    checkRuns: checks.check_runs,
    combinedStatus: statuses.state,
    statuses: statuses.statuses,
  };
}

export async function getRepositoryComparison(
  owner: string,
  name: string,
  base: string,
  head: string
) {
  'use cache';
  mutableCache(owner, name, `compare:${base}:${head}`);
  const repository = await requireRegisteredRepository(owner, name);
  return githubRequest<{
    ahead_by: number;
    behind_by: number;
    commits: GitHubCommit[];
    files?: Array<{
      additions: number;
      deletions: number;
      filename: string;
      patch?: string;
      status: string;
    }>;
    status: string;
    total_commits: number;
  }>({
    path: `/compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}`,
    repository,
  });
}
