import { QaStoreError } from './store';

export const QA_NO_STORE = { 'Cache-Control': 'private, no-store, max-age=0' };

export function qaJson(body: unknown, status = 200) {
  return Response.json(body, { status, headers: QA_NO_STORE });
}

/** Maps ledger refusals to their status; everything else is an opaque 503. */
export function qaErrorResponse(error: unknown, operation: string) {
  if (error instanceof QaStoreError && error.status !== 503)
    return qaJson({ error: error.message }, error.status);
  // Fixed-vocabulary fields only: the Postgres/PostgREST error code (for
  // example PGRST202 for a function missing from the schema cache) and a
  // flag for a malformed ledger result. Never the message or row data.
  console.error(`QA test users ${operation} failed`, {
    errorType: error instanceof Error ? error.name : 'unknown',
    code:
      error instanceof QaStoreError && error.code
        ? error.code.slice(0, 16)
        : null,
    invalidResult:
      error instanceof QaStoreError &&
      error.code === undefined &&
      error.message === 'QA test user ledger returned an invalid result',
  });
  return qaJson({ error: 'QA test users unavailable' }, 503);
}

/** Mutations require JSON bodies, which a cross-site form cannot send. */
export async function readQaJson(request: Request): Promise<unknown> {
  if (
    !request.headers
      .get('content-type')
      ?.toLowerCase()
      .startsWith('application/json')
  )
    return undefined;
  return request.json().catch(() => undefined);
}
