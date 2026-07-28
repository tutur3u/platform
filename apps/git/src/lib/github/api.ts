import 'server-only';

import { GITHUB_API_VERSION } from '@/constants/common';
import { getInstallationToken } from './credentials';
import { GitHubMirrorError } from './errors';
import type { GitRepository } from './types';

function buildGitHubUrl(
  repository: GitRepository,
  path: string,
  query?: Record<string, string | number | undefined>
) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const url = new URL(
    `https://api.github.com/repos/${encodeURIComponent(
      repository.owner
    )}/${encodeURIComponent(repository.name)}${normalizedPath}`
  );

  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  return url;
}

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
    if (response.status === 404) {
      throw new GitHubMirrorError('Repository resource not found', 404);
    }

    if (response.status === 403 || response.status === 429) {
      throw new GitHubMirrorError(
        'GitHub rate limit reached',
        503,
        'github_rate_limited'
      );
    }

    throw new GitHubMirrorError(
      `GitHub request failed with status ${response.status}`,
      502,
      'github_request_failed'
    );
  }

  return (await response.json()) as T;
}
