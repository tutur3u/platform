import { blockIPEdge } from './edge';
import type { BlockInfo } from './types';
import { checkUserSuspension, suspendUser } from './user-suspension';

type BackendRateLimitSource = 'auth' | 'database';

interface BackendRateLimitEscalationOptions {
  endpoint?: string;
  ipAddress?: string | null;
  source: BackendRateLimitSource;
  userId?: string | null;
}

interface BackendRateLimitErrorLike {
  code?: string;
  message?: string;
  status?: number;
}

const DEFAULT_SUSPENSION_REASON =
  'Automatic suspension for API abuse after backend rate limiting.';

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

function buildSuspensionReason({
  endpoint,
  source,
}: Pick<BackendRateLimitEscalationOptions, 'endpoint' | 'source'>): string {
  if (!endpoint) {
    return DEFAULT_SUSPENSION_REASON;
  }

  return `Automatic suspension for API abuse after ${source} rate limiting on ${endpoint}.`;
}

export async function cascadeBackendRateLimitToProxyBan({
  endpoint,
  ipAddress,
  source,
  userId,
}: BackendRateLimitEscalationOptions): Promise<BlockInfo | null> {
  const shouldBlockIp = ipAddress && ipAddress !== 'unknown';

  const blockPromise = shouldBlockIp
    ? blockIPEdge(ipAddress, 'api_abuse')
    : Promise.resolve(null);

  const suspensionPromise = userId
    ? (async () => {
        const suspension = await checkUserSuspension(userId);
        if (suspension.suspended) {
          return true;
        }

        return suspendUser(
          userId,
          buildSuspensionReason({ endpoint, source }),
          null
        );
      })()
    : Promise.resolve(false);

  const [blockResult] = await Promise.allSettled([
    blockPromise,
    suspensionPromise,
  ]);

  return blockResult.status === 'fulfilled' ? blockResult.value : null;
}
