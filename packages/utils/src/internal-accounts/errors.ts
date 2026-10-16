export class InternalAccountAdminError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = 'InternalAccountAdminError';
  }
}
