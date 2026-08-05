import { InternalApiError } from '@tuturuuu/internal-api/client';

const SHARE_REQUEST_TIMEOUT_MS = 15_000;

export function shareRequestOptions(signal: AbortSignal) {
  return {
    fetch: (input: RequestInfo | URL, init?: RequestInit) => {
      const timeoutSignal = AbortSignal.timeout(SHARE_REQUEST_TIMEOUT_MS);
      return fetch(input, {
        ...init,
        signal: AbortSignal.any([signal, timeoutSignal]),
      });
    },
  };
}

export function shouldRetryShareRequest(failureCount: number, error: Error) {
  if (failureCount >= 1 || error.name === 'AbortError') return false;
  if (error instanceof InternalApiError) {
    return error.status >= 500 || error.status === 408 || error.status === 429;
  }
  return true;
}

export function normalizeRoles(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((role) => {
    if (!role || typeof role !== 'object') return [];
    const candidate = role as { id?: unknown; name?: unknown };
    if (typeof candidate.id !== 'string' || typeof candidate.name !== 'string')
      return [];
    return [{ id: candidate.id, name: candidate.name }];
  });
}
