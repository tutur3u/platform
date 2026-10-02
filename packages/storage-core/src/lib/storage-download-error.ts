export class WorkspaceStorageError extends Error {
  constructor(
    message: string,
    public readonly status = 500
  ) {
    super(message);
    this.name = 'WorkspaceStorageError';
  }
}
