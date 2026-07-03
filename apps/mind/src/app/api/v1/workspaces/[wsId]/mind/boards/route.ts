import {
  CreateMindBoardSchema,
  createMindBoard,
  listMindBoards,
} from '@tuturuuu/mind-core';
import { requireMindAccess } from '@tuturuuu/mind-core/access';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
import { serverLogger } from '@/lib/infrastructure/log-drain';

type Params = {
  wsId: string;
};

export const GET = withSessionAuth<Params>(
  async (request, context, { wsId }) => {
    const access = await requireMindAccess({ context, request, wsId });
    if (!access.ok) return access.response;

    try {
      const boards = await listMindBoards(access.normalizedWsId);
      return NextResponse.json({ boards });
    } catch (error) {
      serverLogger.error('Error listing Mind boards:', error);
      return NextResponse.json(
        { error: 'Failed to list Mind boards' },
        { status: 500 }
      );
    }
  },
  { allowAppSessionAuth: true, cache: { maxAge: 30, swr: 30 } }
);

export const POST = withSessionAuth<Params>(
  async (request, context, { wsId }) => {
    const access = await requireMindAccess({ context, request, wsId });
    if (!access.ok) return access.response;

    try {
      const input = CreateMindBoardSchema.parse(await request.json());
      const board = await createMindBoard({
        input,
        userId: context.user.id,
        wsId: access.normalizedWsId,
      });

      return NextResponse.json({ board }, { status: 201 });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json(
          { error: 'Invalid Mind board payload', issues: error.issues },
          { status: 400 }
        );
      }

      serverLogger.error('Error creating Mind board:', error);
      return NextResponse.json(
        { error: 'Failed to create Mind board' },
        { status: 500 }
      );
    }
  },
  { allowAppSessionAuth: true }
);
