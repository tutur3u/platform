import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getDescriptionText } from '@tuturuuu/utils/text-helper';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
import {
  createNotesRouteContext,
  handleNotesRouteError,
  TASK_NOTES_APP_SESSION_AUTH,
} from '../../_lib';

type Params = {
  noteId: string;
  wsId: string;
};

const convertToTaskSchema = z.object({
  listId: z.guid('Invalid list ID'),
});

export const POST = withSessionAuth<Params>(
  async (request: NextRequest, auth, { noteId, wsId: rawWsId }) => {
    try {
      const context = await createNotesRouteContext(auth, rawWsId);
      if (context instanceof NextResponse) return context;

      const { listId } = convertToTaskSchema.parse(await request.json());

      const { data: note, error: noteError } = await context.supabase
        .from('notes')
        .select('id, title, content, creator_id, ws_id, archived')
        .eq('id', noteId)
        .eq('ws_id', context.wsId)
        .eq('creator_id', context.user.id)
        .single();

      if (noteError || !note) {
        return NextResponse.json({ error: 'Note not found' }, { status: 404 });
      }

      if (note.archived) {
        return NextResponse.json(
          { error: 'Note already converted' },
          { status: 400 }
        );
      }

      const { data: list, error: listError } = await context.supabase
        .from('task_lists')
        .select('id, name, board_id')
        .eq('id', listId)
        .single();

      if (listError || !list) {
        return NextResponse.json(
          { error: 'Task list not found' },
          { status: 404 }
        );
      }

      const sbAdmin = await createAdminClient({ noCookie: true });
      const { data: board, error: boardError } = await sbAdmin
        .from('workspace_boards')
        .select('id, ws_id')
        .eq('id', list.board_id)
        .eq('ws_id', context.wsId)
        .single();

      if (boardError || !board) {
        return NextResponse.json(
          { error: 'Invalid task list' },
          { status: 400 }
        );
      }

      const noteDescription = getDescriptionText(note.content);
      const { data: task, error: taskError } = await context.supabase
        .from('tasks')
        .insert({
          creator_id: context.user.id,
          description: noteDescription.length > 255 ? noteDescription : null,
          list_id: listId,
          name: note.title || 'Untitled Task',
        })
        .select('id, name, description')
        .single();

      if (taskError) {
        console.error('Error creating task:', taskError);
        return NextResponse.json(
          { error: 'Failed to create task' },
          { status: 500 }
        );
      }

      const { error: updateError } = await context.supabase
        .from('notes')
        .update({ archived: true })
        .eq('id', noteId)
        .eq('ws_id', context.wsId)
        .eq('creator_id', context.user.id);

      if (updateError) {
        console.error('Error updating note after conversion:', updateError);
      }

      return NextResponse.json({
        data: {
          taskId: task.id,
        },
        message: 'Note converted to task successfully',
        success: true,
      });
    } catch (error) {
      return handleNotesRouteError(
        error,
        'Error in POST /api/v1/workspaces/[wsId]/notes/[noteId]/convert-to-task:'
      );
    }
  },
  { allowAppSessionAuth: TASK_NOTES_APP_SESSION_AUTH }
);
