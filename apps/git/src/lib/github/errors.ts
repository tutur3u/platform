export class GitHubMirrorError extends Error {
  constructor(
    message: string,
    public readonly status = 500,
    public readonly code = 'git_error'
  ) {
    super(message);
    this.name = 'GitHubMirrorError';
  }
}

export function classifyGitHubResponseError({
  message,
  rateLimitRemaining,
  retryAfter,
  status,
}: {
  message?: string;
  rateLimitRemaining?: string | null;
  retryAfter?: string | null;
  status: number;
}) {
  const normalizedMessage = message?.toLowerCase() ?? '';
  const isRateLimited =
    status === 429 ||
    (status === 403 &&
      (rateLimitRemaining === '0' ||
        Boolean(retryAfter) ||
        normalizedMessage.includes('rate limit')));

  if (isRateLimited) {
    return new GitHubMirrorError(
      'GitHub rate limit reached',
      503,
      'github_rate_limited'
    );
  }

  if (status === 403) {
    return new GitHubMirrorError(
      'GitHub denied access to this repository resource',
      502,
      'github_access_denied'
    );
  }

  return new GitHubMirrorError(
    `GitHub request failed with status ${status}`,
    502,
    'github_request_failed'
  );
}

export function getSafeGitHubErrorMessage(error: unknown) {
  if (error instanceof GitHubMirrorError) {
    return error.message;
  }

  return 'GitHub is temporarily unavailable';
}
