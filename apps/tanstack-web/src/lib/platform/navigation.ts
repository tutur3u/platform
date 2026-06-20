export const redirectStatusCodes = [301, 302, 303, 307, 308] as const;

export type RedirectStatusCode = (typeof redirectStatusCodes)[number];

export class MigrationRedirectError extends Error {
  readonly code = 'MIGRATION_REDIRECT';
  readonly location: string;
  readonly status: RedirectStatusCode;

  constructor(location: string, status: RedirectStatusCode = 302) {
    super(`Redirect to ${location}`);
    this.name = 'MigrationRedirectError';
    this.location = location;
    this.status = status;
  }
}

export class MigrationNotFoundError extends Error {
  readonly code = 'MIGRATION_NOT_FOUND';
  readonly status = 404;

  constructor(message = 'Not found') {
    super(message);
    this.name = 'MigrationNotFoundError';
  }
}

export function redirect(
  location: string,
  status: RedirectStatusCode = 302
): never {
  throw new MigrationRedirectError(location, status);
}

export function notFound(message?: string): never {
  throw new MigrationNotFoundError(message);
}

export function isMigrationRedirect(
  error: unknown
): error is MigrationRedirectError {
  return error instanceof MigrationRedirectError;
}

export function isMigrationNotFound(
  error: unknown
): error is MigrationNotFoundError {
  return error instanceof MigrationNotFoundError;
}

export function redirectErrorToResponse(error: MigrationRedirectError) {
  return new Response(null, {
    headers: {
      Location: error.location,
    },
    status: error.status,
  });
}

export function notFoundErrorToResponse(error: MigrationNotFoundError) {
  return new Response(error.message, {
    status: error.status,
  });
}
