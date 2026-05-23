import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import { requireMindAccess } from '@/lib/mind/access';
import {
  archiveMindBoard,
  getMindBoardSnapshot,
  updateMindBoard,
} from '@/lib/mind/repository';
import { UpdateMindBoardSchema } from '@/lib/mind/schemas';

type Params = {
  boardId: string;
  wsId: string;
};

export const GET = withSessionAuth<Params>(
  async (request, context, { boardId, wsId }) => {
    const access = await requireMindAccess({ context, request, wsId });
    if (!access.ok) return access.response;

    try {
      const snapshot = await getMindBoardSnapshot(
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
      serverLogger.error('Error loading Mind board:', error);
      return NextResponse.json(
        { error: 'Failed to load Mind board' },
        { status: 500 }
      );
    }
  },
  { allowAppSessionAuth: true, cache: { maxAge: 15, swr: 15 } }
);

export const PATCH = withSessionAuth<Params>(
  async (request, context, { boardId, wsId }) => {
    const access = await requireMindAccess({ context, request, wsId });
    if (!access.ok) return access.response;

    try {
      const input = UpdateMindBoardSchema.parse(await request.json());
      const board = await updateMindBoard({
        boardId,
        input,
        wsId: access.normalizedWsId,
      });
      if (!board) {
        return NextResponse.json(
          { error: 'Mind board not found' },
          { status: 404 }
        );
      }

      return NextResponse.json({ board });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json(
          { error: 'Invalid Mind board payload', issues: error.issues },
          { status: 400 }
        );
      }

      serverLogger.error('Error updating Mind board:', error);
      return NextResponse.json(
        { error: 'Failed to update Mind board' },
        { status: 500 }
      );
    }
  },
  { allowAppSessionAuth: true }
);

export const DELETE = withSessionAuth<Params>(
  async (request, context, { boardId, wsId }) => {
    const access = await requireMindAccess({ context, request, wsId });
    if (!access.ok) return access.response;

    try {
      const board = await archiveMindBoard(access.normalizedWsId, boardId);
      if (!board) {
        return NextResponse.json(
          { error: 'Mind board not found' },
          { status: 404 }
        );
      }

      return NextResponse.json({ board });
    } catch (error) {
      serverLogger.error('Error deleting Mind board:', error);
      return NextResponse.json(
        { error: 'Failed to delete Mind board' },
        { status: 500 }
      );
    }
  },
  { allowAppSessionAuth: true }
);
