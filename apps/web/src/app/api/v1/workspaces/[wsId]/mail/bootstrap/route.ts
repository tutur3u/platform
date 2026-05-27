import { type NextRequest, NextResponse } from 'next/server';
import { getMailBootstrap } from '@/lib/mail/repository';
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
    const payload = await getMailBootstrap(ctx);
    return NextResponse.json(payload);
  });
}
