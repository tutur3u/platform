import { MAX_SEARCH_LENGTH } from '@tuturuuu/utils/constants';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { searchRateLimitSubjectCandidates } from '@/lib/rate-limits/subject-resolution';
import { authorizeAbuseIntelligenceRequest } from '../abuse-intelligence/_shared';

const QuerySchema = z.object({
  kind: z.enum(['ip', 'user', 'workspace']).default('workspace'),
  limit: z.coerce.number().int().positive().max(25).default(8),
  q: z.string().trim().max(MAX_SEARCH_LENGTH).optional(),
});

export async function GET(request: Request) {
  const authorization = await authorizeAbuseIntelligenceRequest(request);
  if (!authorization.ok) {
    return authorization.response;
  }

  const url = new URL(request.url);
  const parsed = QuerySchema.safeParse({
    kind: url.searchParams.get('kind') ?? undefined,
    limit: url.searchParams.get('limit') ?? undefined,
    q: url.searchParams.get('q') ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { errors: parsed.error.issues, message: 'Invalid query parameters' },
      { status: 400 }
    );
  }

  try {
    const results = await searchRateLimitSubjectCandidates({
      client: authorization.sbAdmin,
      kind: parsed.data.kind,
      limit: parsed.data.limit,
      q: parsed.data.q,
    });

    return NextResponse.json({ results });
  } catch (error) {
    console.error('Failed to search rate-limit subjects', error);
    return NextResponse.json(
      { message: 'Failed to search rate-limit subjects' },
      { status: 500 }
    );
  }
}
