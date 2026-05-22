import { NextResponse } from 'next/server';
import { withSessionAuth } from '@/lib/api-auth';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import { requireMindAccess } from '@/lib/mind/access';
import { listMindAiPatches } from '@/lib/mind/repository';

type Params = {
  boardId: string;
  wsId: string;
};

export const GET = withSessionAuth<Params>(
  async (request, context, { boardId, wsId }) => {
    const access = await requireMindAccess({ context, request, wsId });
    if (!access.ok) return access.response;

    try {
      const patches = await listMindAiPatches({
        boardId,
        wsId: access.normalizedWsId,
      });

      return NextResponse.json({ patches });
    } catch (error) {
      serverLogger.error('Error loading Mind AI patches:', error);
      return NextResponse.json(
        { error: 'Failed to load Mind AI patches' },
        { status: 500 }
      );
    }
  },
  { allowAppSessionAuth: true, cache: { maxAge: 10, swr: 10 } }
);
