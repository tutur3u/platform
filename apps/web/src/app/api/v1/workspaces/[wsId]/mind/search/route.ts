import { NextResponse } from 'next/server';
import { withSessionAuth } from '@/lib/api-auth';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import { requireMindAccess } from '@/lib/mind/access';
import { searchMindNodes } from '@/lib/mind/repository';

type Params = {
  wsId: string;
};

export const GET = withSessionAuth<Params>(
  async (request, context, { wsId }) => {
    const access = await requireMindAccess({ context, request, wsId });
    if (!access.ok) return access.response;

    try {
      const { searchParams } = new URL(request.url);
      const nodes = await searchMindNodes({
        boardId: searchParams.get('boardId') ?? undefined,
        q: searchParams.get('q') ?? undefined,
        wsId: access.normalizedWsId,
      });

      return NextResponse.json({ nodes });
    } catch (error) {
      serverLogger.error('Error searching Mind nodes:', error);
      return NextResponse.json(
        { error: 'Failed to search Mind nodes' },
        { status: 500 }
      );
    }
  },
  { allowAppSessionAuth: true, cache: { maxAge: 15, swr: 15 } }
);
