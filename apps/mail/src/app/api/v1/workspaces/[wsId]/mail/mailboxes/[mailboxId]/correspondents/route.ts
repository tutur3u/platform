import { type NextRequest, NextResponse } from 'next/server';
import {
  CORRESPONDENT_MAX_QUERY_LENGTH,
  clampCorrespondentLimit,
} from '@/lib/mail/correspondents-ranking';
import { listMailCorrespondents } from '@/lib/mail/repository/correspondents';
import { withMailContext } from '@/lib/mail/route-utils';

type RouteParams = { mailboxId: string; wsId: string };

const NO_STORE = { 'Cache-Control': 'private, no-store' };

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<RouteParams> }
) {
  const { mailboxId, wsId } = await params;
  const searchParams = request.nextUrl.searchParams;
  const query = (searchParams.get('q') ?? '').trim();
  if (query.length > CORRESPONDENT_MAX_QUERY_LENGTH) {
    return NextResponse.json(
      { error: 'Query is too long' },
      { status: 400, headers: NO_STORE }
    );
  }
  const limit = clampCorrespondentLimit(searchParams.get('limit') ?? 8);

  return withMailContext(request, wsId, async (ctx) => {
    const data = await listMailCorrespondents({
      ctx,
      mailboxId,
      query,
      limit,
    });
    return data
      ? NextResponse.json({ data }, { headers: NO_STORE })
      : NextResponse.json(
          { error: 'Forbidden' },
          { status: 403, headers: NO_STORE }
        );
  });
}
