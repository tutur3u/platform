import { type NextRequest, NextResponse } from 'next/server';
import {
  getMailBootstrap,
  getMailUnreadCounts,
} from '@/lib/mail/repository/bootstrap';
import { withMailContext } from '@/lib/mail/route-utils';

type RouteParams = {
  wsId: string;
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<RouteParams> }
) {
  const { wsId } = await params;

  return withMailContext(request, wsId, async (ctx) => {
    const view = request.nextUrl.searchParams.get('view');
    const payload =
      view === 'counts'
        ? await getMailUnreadCounts(ctx)
        : await getMailBootstrap(ctx, view !== 'mailboxes');
    return NextResponse.json(payload);
  });
}
