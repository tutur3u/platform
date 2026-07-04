import { applyMindAiPatch } from '@tuturuuu/mind-core';
import { requireMindAccess } from '@tuturuuu/mind-core/access';
import { NextResponse } from 'next/server';
import { withSessionAuth } from '@/lib/api-auth';

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
      console.error('Error applying Mind AI patch:', error);
      return NextResponse.json(
        { error: 'Failed to apply Mind AI patch' },
        { status: 500 }
      );
    }
  },
  { allowAppSessionAuth: true }
);
