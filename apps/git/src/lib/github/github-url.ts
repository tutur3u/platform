import type { GitRepository } from './types';

export function buildGitHubUrl(
  repository: GitRepository,
  path: string,
  query?: Record<string, string | number | undefined>
) {
  const normalizedPath =
    path.length === 0 ? '' : path.startsWith('/') ? path : `/${path}`;
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
