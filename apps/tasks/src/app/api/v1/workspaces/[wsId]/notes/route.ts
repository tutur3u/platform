import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withSessionAuth } from '@/lib/api-auth';
import {
  createNoteSchema,
  createNotesRouteContext,
  handleNotesRouteError,
  TASK_NOTES_APP_SESSION_AUTH,
} from './_lib';

type Params = {
  wsId: string;
};

export const GET = withSessionAuth<Params>(
  async (request, auth, { wsId: rawWsId }) => {
    try {
      const context = await createNotesRouteContext(auth, rawWsId);
      if (context instanceof NextResponse) return context;

      const archivedParam = new URL(request.url).searchParams.get('archived');
      const archived = archivedParam === '1' || archivedParam === 'true';

      const { data: notes, error } = await context.supabase
        .from('notes')
        .select('*')
        .eq('ws_id', context.wsId)
        .eq('creator_id', context.user.id)
        .eq('archived', archived)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching notes:', error);
        return NextResponse.json(
          { error: 'Failed to fetch notes' },
          { status: 500 }
        );
      }

      return NextResponse.json(notes ?? []);
    } catch (error) {
      return handleNotesRouteError(
        error,
        'Error in GET /api/v1/workspaces/[wsId]/notes:'
      );
    }
  },
  { allowAppSessionAuth: TASK_NOTES_APP_SESSION_AUTH }
);

export const POST = withSessionAuth<Params>(
  async (request: NextRequest, auth, { wsId: rawWsId }) => {
    try {
      const context = await createNotesRouteContext(auth, rawWsId);
      if (context instanceof NextResponse) return context;

      const { content, title } = createNoteSchema.parse(await request.json());

      const { data: note, error } = await context.supabase
        .from('notes')
        .insert({
          content,
          creator_id: context.user.id,
          title,
          ws_id: context.wsId,
        })
        .select('*')
        .single();

      if (error) {
        console.error('Error creating note:', error);
        return NextResponse.json(
          { error: 'Failed to create note' },
          { status: 500 }
        );
      }

      return NextResponse.json(note);
    } catch (error) {
      return handleNotesRouteError(
        error,
        'Error in POST /api/v1/workspaces/[wsId]/notes:'
      );
    }
  },
  { allowAppSessionAuth: TASK_NOTES_APP_SESSION_AUTH }
);
