import 'server-only';

import { GITHUB_API_VERSION } from '@/constants/common';
import { getInstallationToken } from './credentials';
import { classifyGitHubResponseError, GitHubMirrorError } from './errors';
import { buildGitHubUrl } from './github-url';
import type { GitRepository } from './types';

export async function githubRequest<T>({
  accept = 'application/vnd.github+json',
  path,
  query,
  repository,
}: {
  accept?: string;
  path: string;
  query?: Record<string, string | number | undefined>;
  repository: GitRepository;
}): Promise<T> {
  const token = await getInstallationToken(repository.githubRepositoryId);
  const response = await fetch(buildGitHubUrl(repository, path, query), {
    headers: {
      Accept: accept,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'X-GitHub-Api-Version': GITHUB_API_VERSION,
    },
  });

  if (!response.ok) {
    const responseBody = (await response
      .clone()
      .json()
      .catch(() => null)) as { message?: string } | null;

    if (response.status === 404) {
      throw new GitHubMirrorError('Repository resource not found', 404);
    }

    throw classifyGitHubResponseError({
      message: responseBody?.message,
      rateLimitRemaining: response.headers.get('x-ratelimit-remaining'),
      retryAfter: response.headers.get('retry-after'),
      status: response.status,
    });
  }

  return (await response.json()) as T;
}
