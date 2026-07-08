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

const convertToProjectSchema = z.object({
  description: z.string().max(1000, 'Description too long').optional(),
  name: z
    .string()
    .min(1, 'Project name is required')
    .max(255, 'Project name too long'),
});

export const POST = withSessionAuth<Params>(
  async (request: NextRequest, auth, { noteId, wsId: rawWsId }) => {
    try {
      const context = await createNotesRouteContext(auth, rawWsId);
      if (context instanceof NextResponse) return context;

      const { description, name } = convertToProjectSchema.parse(
        await request.json()
      );

      const { data: note, error: noteError } = await context.supabase
        .from('notes')
        .select('id, content, creator_id, ws_id, archived')
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

      const { data: project, error: projectError } = await context.supabase
        .from('task_projects')
        .insert({
          creator_id: context.user.id,
          description: description || null,
          name,
          ws_id: context.wsId,
        })
        .select('id, name, description, status')
        .single();

      if (projectError) {
        console.error('Error creating task project:', projectError);
        return NextResponse.json(
          { error: 'Failed to create project' },
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
          projectId: project.id,
        },
        message: 'Note converted to project successfully',
        success: true,
      });
    } catch (error) {
      return handleNotesRouteError(
        error,
        'Error in POST /api/v1/workspaces/[wsId]/notes/[noteId]/convert-to-project:'
      );
    }
  },
  { allowAppSessionAuth: TASK_NOTES_APP_SESSION_AUTH }
);
