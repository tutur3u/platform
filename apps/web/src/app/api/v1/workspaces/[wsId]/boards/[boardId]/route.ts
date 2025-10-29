import { createErrorResponse, withApiAuth } from '@/lib/api-middleware';
import { createDynamicAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

interface BoardParams {
  wsId: string;
  boardId: string;
}

const boardParamsSchema = z.object({
  wsId: z.string().uuid(),
  boardId: z.string().uuid(),
});

export const DELETE = withApiAuth<BoardParams>(
  async (_, { params, context }) => {
    try {
      // Validate and parse params
      const parseResult = boardParamsSchema.safeParse(params);
      if (!parseResult.success) {
        return createErrorResponse(
          'Bad Request',
          'Invalid workspace or board ID',
          400,
          'INVALID_PARAMS'
        );
      }

      const { wsId, boardId } = parseResult.data;

      // Verify the wsId from params matches the API key's workspace
      if (wsId !== context.wsId) {
        return createErrorResponse(
          'Forbidden',
          'Workspace ID does not match API key workspace',
          403,
          'WORKSPACE_MISMATCH'
        );
      }

      const supabase = await createDynamicAdminClient();

      // Verify board exists, belongs to workspace, and is already soft-deleted
      const { data: board, error: boardCheckError } = await supabase
        .from('workspace_boards')
        .select('id, ws_id, deleted_at')
        .eq('id', boardId)
        .eq('ws_id', wsId)
        .single();

      if (boardCheckError || !board) {
        return createErrorResponse(
          'Not Found',
          'Board not found',
          404,
          'BOARD_NOT_FOUND'
        );
      }

      // Only allow permanent deletion if board is already soft-deleted
      if (!board.deleted_at) {
        return createErrorResponse(
          'Bad Request',
          'Board must be moved to trash first. Please move the board to trash before permanently deleting it.',
          400,
          'BOARD_NOT_IN_TRASH'
        );
      }

      // Permanently delete the board from database
      const { error: deleteError } = await supabase
        .from('workspace_boards')
        .delete()
        .eq('id', boardId);

      if (deleteError) {
        console.error('Supabase error:', deleteError);
        return createErrorResponse(
          'Internal Server Error',
          'Failed to permanently delete board',
          500,
          'DELETE_FAILED'
        );
      }

      return NextResponse.json({
        success: true,
        message: 'Board permanently deleted',
      });
    } catch (error) {
      console.error('Error permanently deleting board:', error);
      return createErrorResponse(
        'Internal Server Error',
        'An unexpected error occurred',
        500,
        'UNEXPECTED_ERROR'
      );
    }
  },
  { permissions: ['manage_projects'] }
);

const restoreBodySchema = z.object({
  restore: z.boolean(),
});

export const PATCH = withApiAuth<BoardParams>(
  async (request, { params, context }) => {
    try {
      // Validate and parse params
      const parseResult = boardParamsSchema.safeParse(params);
      if (!parseResult.success) {
        return createErrorResponse(
          'Bad Request',
          'Invalid workspace or board ID',
          400,
          'INVALID_PARAMS'
        );
      }

      const { wsId, boardId } = parseResult.data;

      // Verify the wsId from params matches the API key's workspace
      if (wsId !== context.wsId) {
        return createErrorResponse(
          'Forbidden',
          'Workspace ID does not match API key workspace',
          403,
          'WORKSPACE_MISMATCH'
        );
      }

      // Parse and validate request body
      let body: any;
      try {
        body = await request.json();
      } catch (_) {
        return createErrorResponse(
          'Bad Request',
          'Invalid JSON in request body',
          400,
          'INVALID_JSON'
        );
      }

      const bodyParseResult = restoreBodySchema.safeParse(body);
      if (!bodyParseResult.success) {
        return createErrorResponse(
          'Bad Request',
          'Invalid request body. Expected: { restore: boolean }',
          400,
          'INVALID_BODY'
        );
      }

      const { restore } = bodyParseResult.data;

      if (restore !== true) {
        return createErrorResponse(
          'Bad Request',
          'Invalid request. Use restore: true to restore a board',
          400,
          'INVALID_RESTORE_VALUE'
        );
      }

      const supabase = await createDynamicAdminClient();

      // Verify board exists and belongs to workspace
      const { data: board, error: boardCheckError } = await supabase
        .from('workspace_boards')
        .select('id, ws_id, deleted_at')
        .eq('id', boardId)
        .eq('ws_id', wsId)
        .single();

      if (boardCheckError || !board) {
        return createErrorResponse(
          'Not Found',
          'Board not found',
          404,
          'BOARD_NOT_FOUND'
        );
      }

      if (!board.deleted_at) {
        return createErrorResponse(
          'Bad Request',
          'Board is not in trash',
          400,
          'BOARD_NOT_IN_TRASH'
        );
      }

      // Restore the board by setting deleted_at to null
      const { error: restoreError } = await supabase
        .from('workspace_boards')
        .update({ deleted_at: null })
        .eq('id', boardId);

      if (restoreError) {
        console.error('Supabase error:', restoreError);
        return createErrorResponse(
          'Internal Server Error',
          'Failed to restore board',
          500,
          'RESTORE_FAILED'
        );
      }

      return NextResponse.json({
        success: true,
        message: 'Board restored successfully',
      });
    } catch (error) {
      console.error('Error restoring board:', error);
      return createErrorResponse(
        'Internal Server Error',
        'An unexpected error occurred',
        500,
        'UNEXPECTED_ERROR'
      );
    }
  },
  { permissions: ['manage_projects'] }
);
