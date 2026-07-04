import {
  getMindBoardGraphSnapshot,
  SaveMindGraphSchema,
  saveMindGraph,
} from '@tuturuuu/mind-core';
import { requireMindAccess } from '@tuturuuu/mind-core/access';
import { NextResponse } from 'next/server';
import { z } from 'zod';
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
      const snapshot = await getMindBoardGraphSnapshot(
        access.normalizedWsId,
        boardId
      );
      if (!snapshot) {
        return NextResponse.json(
          { error: 'Mind board not found' },
          { status: 404 }
        );
      }

      return NextResponse.json(snapshot);
    } catch (error) {
      console.error('Error loading Mind graph snapshot:', error);
      return NextResponse.json(
        { error: 'Failed to load Mind graph snapshot' },
        { status: 500 }
      );
    }
  },
  { allowAppSessionAuth: true, cache: { maxAge: 15, swr: 15 } }
);

export const PUT = withSessionAuth<Params>(
  async (request, context, { boardId, wsId }) => {
    const access = await requireMindAccess({ context, request, wsId });
    if (!access.ok) return access.response;

    try {
      const input = SaveMindGraphSchema.parse(await request.json());
      const snapshot = await saveMindGraph({
        boardId,
        input,
        wsId: access.normalizedWsId,
      });
      if (!snapshot) {
        return NextResponse.json(
          { error: 'Mind board not found' },
          { status: 404 }
        );
      }

      return NextResponse.json(snapshot);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json(
          { error: 'Invalid Mind graph payload', issues: error.issues },
          { status: 400 }
        );
      }

      if (error instanceof Error && error.message === 'Mind board not found') {
        return NextResponse.json(
          { error: 'Mind board not found' },
          { status: 404 }
        );
      }

      console.error('Error saving Mind graph:', error);
      return NextResponse.json(
        { error: 'Failed to save Mind graph' },
        { status: 500 }
      );
    }
  },
  { allowAppSessionAuth: true, maxPayloadSize: 2 * 1024 * 1024 }
);
