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

export function getSafeGitHubErrorMessage(error: unknown) {
  if (error instanceof GitHubMirrorError) {
    return error.message;
  }

  return 'GitHub is temporarily unavailable';
}
