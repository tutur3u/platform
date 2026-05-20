import { NextResponse } from 'next/server';
import { withSessionAuth } from '@/lib/api-auth';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import { requireMindAccess } from '@/lib/mind/access';
import { applyMindAiPatch } from '@/lib/mind/repository';

type Params = {
  patchId: string;
  wsId: string;
};

export const POST = withSessionAuth<Params>(
  async (request, context, { patchId, wsId }) => {
    const access = await requireMindAccess({ context, request, wsId });
    if (!access.ok) return access.response;

    try {
      const patch = await applyMindAiPatch({
        patchId,
        userId: context.user.id,
        wsId: access.normalizedWsId,
      });
      if (!patch) {
        return NextResponse.json(
          { error: 'Mind patch not found' },
          { status: 404 }
        );
      }

      return NextResponse.json({ patch });
    } catch (error) {
      serverLogger.error('Error applying Mind AI patch:', error);
      return NextResponse.json(
        { error: 'Failed to apply Mind AI patch' },
        { status: 500 }
      );
    }
  },
  { allowAppSessionAuth: true }
);
