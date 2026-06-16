import { NextResponse } from 'next/server';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import { scanReadUsageKeys } from '@/lib/infrastructure/rate-limit-redis-admin';
import { authorizeAbuseIntelligenceRequest } from '../../abuse-intelligence/_shared';

// Matches the edge proxy guard's Redis bucket namespace (api-proxy-guard.ts).
const READ_BUCKET_MATCH = 'proxy:web:api:*';

export async function GET(request: Request) {
  const authorization = await authorizeAbuseIntelligenceRequest(request);
  if (!authorization.ok) {
    return authorization.response;
  }

  const url = new URL(request.url);
  const bucketPrefix =
    url.searchParams.get('bucketPrefix')?.trim() || undefined;

  const [{ data: counters, error }, readBuckets] = await Promise.all([
    authorization.sbAdmin.rpc('admin_list_rate_limit_counters', {
      p_bucket_prefix: bucketPrefix,
      p_limit: 100,
    }),
    scanReadUsageKeys(READ_BUCKET_MATCH),
  ]);

  if (error) {
    serverLogger.error('Failed to load rate-limit counters', error);
    return NextResponse.json(
      { message: 'Failed to load rate-limit counters' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    readBuckets,
    writeCounters: counters ?? [],
  });
}
