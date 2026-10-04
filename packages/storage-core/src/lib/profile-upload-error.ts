/** Shared error identity without loading the server-only budget orchestration. */
export class ProfileUploadError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly retryAfter?: number
  ) {
    super(message);
  }
}
