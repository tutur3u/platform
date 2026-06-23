import type { BlockInfo } from './types';

type BackendRateLimitSource = 'auth' | 'database';

interface BackendRateLimitEscalationOptions {
  endpoint?: string;
  ipAddress?: string | null;
  source: BackendRateLimitSource;
  /**
   * Deprecated/no-op. Backend 429s are shared availability signals, not enough
   * evidence to create or extend a user suspension.
   */
  userId?: string | null;
}

interface BackendRateLimitErrorLike {
  code?: string;
  message?: string;
  status?: number;
}

export function isBackendRateLimitError(
  error: unknown
): error is BackendRateLimitErrorLike {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const candidate = error as BackendRateLimitErrorLike;
  return (
    candidate.status === 429 ||
    candidate.code === 'over_request_rate_limit' ||
    (typeof candidate.message === 'string' &&
      /request rate limit reached/i.test(candidate.message))
  );
}

export async function cascadeBackendRateLimitToProxyBan({
  ipAddress: _ipAddress,
}: BackendRateLimitEscalationOptions): Promise<BlockInfo | null> {
  // A backend 429 is an availability/backpressure signal. It is not enough
  // evidence to hard-ban a public NAT IP that may represent a classroom,
  // university, or enterprise office.
  return null;
}
