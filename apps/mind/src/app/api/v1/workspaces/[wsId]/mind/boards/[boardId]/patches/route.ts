import { listMindAiPatches } from '@tuturuuu/mind-core';
import { requireMindAccess } from '@tuturuuu/mind-core/access';
import { NextResponse } from 'next/server';
import { withSessionAuth } from '@/lib/api-auth';

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
      console.error('Error loading Mind AI patches:', error);
      return NextResponse.json(
        { error: 'Failed to load Mind AI patches' },
        { status: 500 }
      );
    }
  },
  { allowAppSessionAuth: true, cache: { maxAge: 10, swr: 10 } }
);
