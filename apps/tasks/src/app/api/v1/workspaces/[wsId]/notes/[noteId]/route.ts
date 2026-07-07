import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withSessionAuth } from '@/lib/api-auth';
import {
  createNotesRouteContext,
  handleNotesRouteError,
  TASK_NOTES_APP_SESSION_AUTH,
  updateNoteSchema,
} from '../_lib';

type Params = {
  noteId: string;
  wsId: string;
};

export const PUT = withSessionAuth<Params>(
  async (request: NextRequest, auth, { noteId, wsId: rawWsId }) => {
    try {
      const context = await createNotesRouteContext(auth, rawWsId);
      if (context instanceof NextResponse) return context;

      const { content, title } = updateNoteSchema.parse(await request.json());

      const { data: updatedNote, error } = await context.supabase
        .from('notes')
        .update({ content, title })
        .eq('id', noteId)
        .eq('ws_id', context.wsId)
        .eq('creator_id', context.user.id)
        .select('*')
        .maybeSingle();

      if (error) {
        console.error('Error updating note:', error);
        return NextResponse.json(
          { error: 'Failed to update note' },
          { status: 500 }
        );
      }

      if (!updatedNote) {
        return NextResponse.json({ error: 'Note not found' }, { status: 404 });
      }

      return NextResponse.json(updatedNote);
    } catch (error) {
      return handleNotesRouteError(
        error,
        'Error in PUT /api/v1/workspaces/[wsId]/notes/[noteId]:'
      );
    }
  },
  { allowAppSessionAuth: TASK_NOTES_APP_SESSION_AUTH }
);

export const DELETE = withSessionAuth<Params>(
  async (_request, auth, { noteId, wsId: rawWsId }) => {
    try {
      const context = await createNotesRouteContext(auth, rawWsId);
      if (context instanceof NextResponse) return context;

      const { error } = await context.supabase
        .from('notes')
        .delete()
        .eq('id', noteId)
        .eq('ws_id', context.wsId)
        .eq('creator_id', context.user.id);

      if (error) {
        console.error('Error deleting note:', error);
        return NextResponse.json(
          { error: 'Failed to delete note' },
          { status: 500 }
        );
      }

      return NextResponse.json({ success: true });
    } catch (error) {
      return handleNotesRouteError(
        error,
        'Error in DELETE /api/v1/workspaces/[wsId]/notes/[noteId]:'
      );
    }
  },
  { allowAppSessionAuth: TASK_NOTES_APP_SESSION_AUTH }
);
