import 'server-only';

import { GITHUB_API_VERSION } from '../../constants/common';
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
  const result = await githubRequestWithMetadata<T>({
    accept,
    path,
    query,
    repository,
  });
  return result.body;
}

export async function githubRequestWithMetadata<T>({
  accept = 'application/vnd.github+json',
  path,
  query,
  repository,
}: {
  accept?: string;
  path: string;
  query?: Record<string, string | number | undefined>;
  repository: GitRepository;
}): Promise<{ body: T; hasNextPage: boolean }> {
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

  return {
    body: (await response.json()) as T,
    hasNextPage: linkHeaderHasNextPage(response.headers.get('link')),
  };
}

export function linkHeaderHasNextPage(linkHeader: string | null): boolean {
  if (!linkHeader) return false;

  return linkHeader.split(',').some((link) =>
    link
      .split(';')
      .slice(1)
      .some((parameter) => {
        const match = parameter.match(
          /^\s*rel\s*=\s*(?:"([^"]*)"|([^;\s]*))\s*$/iu
        );
        const relation = match?.[1] ?? match?.[2];
        return relation?.split(/\s+/u).includes('next') ?? false;
      })
  );
}
