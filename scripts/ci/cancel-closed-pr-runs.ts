import { readFileSync } from 'node:fs';
import {
  type CancelClient,
  cancelClosedPullRequestRuns,
  type PullRequestCloseEvent,
  type WorkflowRun,
} from './cancel-closed-pr-runs-core.ts';

type RestWorkflowRunsResponse = {
  workflow_runs?: WorkflowRun[];
};

type RequestOptions = {
  method?: string;
  query?: Record<string, string | number | undefined>;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readJsonFile<T>(filePath: string): T {
  const parsed = JSON.parse(readFileSync(filePath, 'utf8')) as unknown;

  if (!isObject(parsed)) {
    throw new Error(`${filePath} did not contain a JSON object.`);
  }

  return parsed as T;
}

function buildGitHubUrl({
  apiBase,
  path,
  query,
}: {
  apiBase: string;
  path: string;
  query?: Record<string, string | number | undefined>;
}): string {
  const url = new URL(path, `${apiBase.replace(/\/$/, '')}/`);

  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  return url.toString();
}

function getRepositoryApiPath(repository: string): string {
  const [owner, repo] = repository.split('/');

  if (!owner || !repo) {
    throw new Error(`Invalid GITHUB_REPOSITORY value: ${repository}`);
  }

  return `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
}

export function createRestCancelClient({
  apiBase = 'https://api.github.com',
  repository,
  token,
}: {
  apiBase?: string;
  repository: string;
  token: string;
}): CancelClient {
  const repositoryPath = getRepositoryApiPath(repository);

  async function request<T>(
    path: string,
    { method = 'GET', query }: RequestOptions = {}
  ): Promise<{ data: T | null; status: number }> {
    const response = await fetch(buildGitHubUrl({ apiBase, path, query }), {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
      method,
    });

    if (response.status === 204) {
      return { data: null, status: response.status };
    }

    const text = await response.text();
    const data = text ? (JSON.parse(text) as T) : null;

    if (!response.ok && method === 'GET') {
      throw new Error(
        `GitHub API ${method} ${path} failed with ${response.status}.`
      );
    }

    return { data, status: response.status };
  }

  return {
    async cancelWorkflowRun(runId) {
      const response = await request<unknown>(
        `${repositoryPath}/actions/runs/${runId}/cancel`,
        { method: 'POST' }
      );

      return { status: response.status };
    },
    async listWorkflowRuns({ headSha, page, perPage, status }) {
      const response = await request<RestWorkflowRunsResponse>(
        `${repositoryPath}/actions/runs`,
        {
          query: {
            head_sha: headSha,
            page,
            per_page: perPage,
            status,
          },
        }
      );

      return response.data?.workflow_runs ?? [];
    },
  };
}

async function main(env = process.env) {
  const eventPath = env.GITHUB_EVENT_PATH;
  const repository = env.GITHUB_REPOSITORY;
  const token = env.GITHUB_TOKEN;

  if (!eventPath) {
    throw new Error('GITHUB_EVENT_PATH is required.');
  }

  if (!repository) {
    throw new Error('GITHUB_REPOSITORY is required.');
  }

  if (!token) {
    throw new Error('GITHUB_TOKEN is required.');
  }

  await cancelClosedPullRequestRuns({
    client: createRestCancelClient({
      apiBase: env.GITHUB_API_URL,
      repository,
      token,
    }),
    currentRunId: env.GITHUB_RUN_ID,
    event: readJsonFile<PullRequestCloseEvent>(eventPath),
    repository,
  });
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
