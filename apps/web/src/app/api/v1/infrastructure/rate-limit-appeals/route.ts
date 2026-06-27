import { MAX_SEARCH_LENGTH } from '@tuturuuu/utils/constants';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import { authorizeAbuseIntelligenceRequest } from '../abuse-intelligence/_shared';

const APPEAL_STATUSES = ['approved', 'closed', 'pending', 'rejected'] as const;
const APPEAL_STATUS_FILTERS = [...APPEAL_STATUSES, 'all'] as const;
const UUID_PATTERN =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/u;

const QuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(500).default(100),
  q: z.string().trim().max(MAX_SEARCH_LENGTH).optional(),
  status: z.enum(APPEAL_STATUS_FILTERS).default('pending'),
});

function rateLimitAppealsTable(client: unknown) {
  return (client as { from: (table: string) => any }).from(
    'rate_limit_appeals'
  );
}

export async function GET(request: Request) {
  const authorization = await authorizeAbuseIntelligenceRequest(request);
  if (!authorization.ok) {
    return authorization.response;
  }

  const url = new URL(request.url);
  const parsed = QuerySchema.safeParse({
    limit: url.searchParams.get('limit') ?? undefined,
    q: url.searchParams.get('q') ?? undefined,
    status: url.searchParams.get('status') ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { errors: parsed.error.issues, message: 'Invalid query parameters' },
      { status: 400 }
    );
  }

  const { limit, q, status } = parsed.data;

  let query = rateLimitAppealsTable(authorization.sbAdmin)
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (status !== 'all') {
    query = query.eq('status', status);
  }
  if (q) {
    query = UUID_PATTERN.test(q)
      ? query.eq('workspace_id', q.toLowerCase())
      : query.ilike('client_ip', `%${q}%`);
  }

  const { data, error } = await query;
  if (error) {
    serverLogger.error('Failed to load rate-limit appeals', error);
    return NextResponse.json(
      { message: 'Failed to load rate-limit appeals' },
      { status: 500 }
    );
  }

  const appeals = data ?? [];
  const summary = {
    approved: 0,
    closed: 0,
    pending: 0,
    rejected: 0,
    total: appeals.length,
  };
  for (const appeal of appeals) {
    if ((APPEAL_STATUSES as readonly string[]).includes(appeal.status)) {
      summary[appeal.status as (typeof APPEAL_STATUSES)[number]] += 1;
    }
  }

  return NextResponse.json({ appeals, summary });
}
