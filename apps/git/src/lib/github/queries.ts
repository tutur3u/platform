import 'server-only';

import { cacheLife, cacheTag } from 'next/cache';
import { githubRequest } from './api';
import { requireRegisteredRepository } from './registry';
import type {
  GitHubCommit,
  GitHubContent,
  GitHubContributor,
  GitHubIssue,
  GitHubPullRequest,
  GitHubRelease,
  GitHubRepository,
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
  const [run, jobs, artifacts] = await Promise.all([
    githubRequest<GitHubWorkflowRun>({
      path: `/actions/runs/${runId}`,
      repository,
    }),
    githubRequest<{
      jobs: Array<{
        completed_at: string | null;
        conclusion: string | null;
        html_url: string;
        id: number;
        name: string;
        started_at: string | null;
        status: string;
        steps?: Array<{
          conclusion: string | null;
          name: string;
          number: number;
          status: string;
        }>;
      }>;
    }>({ path: `/actions/runs/${runId}/jobs`, repository }),
    githubRequest<{
      artifacts: Array<{
        archive_download_url: string;
        expired: boolean;
        expires_at: string | null;
        id: number;
        name: string;
        size_in_bytes: number;
      }>;
    }>({ path: `/actions/runs/${runId}/artifacts`, repository }),
  ]);

  return { artifacts: artifacts.artifacts, jobs: jobs.jobs, run };
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
  const [issue, comments] = await Promise.all([
    githubRequest<
      GitHubIssue & { body: string | null; closed_at: string | null }
    >({ path: `/issues/${number}`, repository }),
    githubRequest<
      Array<{
        body: string;
        created_at: string;
        html_url: string;
        id: number;
        user: { avatar_url: string; login: string };
      }>
    >({ path: `/issues/${number}/comments`, repository }),
  ]);
  return { comments, issue };
}

export async function getRepositoryPull(
  owner: string,
  name: string,
  number: number
) {
  'use cache';
  mutableCache(owner, name, `pull:${number}`);
  const repository = await requireRegisteredRepository(owner, name);
  const [pull, files, reviews] = await Promise.all([
    githubRequest<
      GitHubPullRequest & {
        body: string | null;
        commits: number;
        additions: number;
        deletions: number;
        changed_files: number;
      }
    >({ path: `/pulls/${number}`, repository }),
    githubRequest<
      Array<{
        additions: number;
        changes: number;
        deletions: number;
        filename: string;
        patch?: string;
        status: string;
      }>
    >({ path: `/pulls/${number}/files`, query: { per_page: 100 }, repository }),
    githubRequest<
      Array<{
        body: string;
        id: number;
        state: string;
        submitted_at: string;
        user: { avatar_url: string; login: string };
      }>
    >({ path: `/pulls/${number}/reviews`, repository }),
  ]);
  return { files, pull, reviews };
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
