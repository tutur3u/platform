import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import { createClient } from '@tuturuuu/supabase/next/server';
import {
  MAX_LONG_TEXT_LENGTH,
  MAX_NOTE_TITLE_LENGTH,
  MAX_SHORT_TEXT_LENGTH,
} from '@tuturuuu/utils/constants';
import { verifyWorkspaceMembershipType } from '@tuturuuu/utils/workspace-helper';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

// TipTap JSONContent schema for rich text
const jsonContentSchema: z.ZodType<any> = z.lazy(() =>
  z.object({
    type: z.string().max(MAX_SHORT_TEXT_LENGTH),
    attrs: z.record(z.string(), z.any()).optional(),
    content: z.array(jsonContentSchema).optional(),
    marks: z.array(z.any()).optional(),
    text: z.string().max(MAX_LONG_TEXT_LENGTH).optional(),
  })
);

const createNoteSchema = z.object({
  title: z.string().max(MAX_NOTE_TITLE_LENGTH).nullable().optional(),
  content: jsonContentSchema.refine(
    (val) => val.type === 'doc',
    'Content must be a valid TipTap document'
  ),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ wsId: string }> }
) {
  try {
    const { wsId } = await params;
    const supabase = await createClient();

    // Get current user
    const { user, authError: userError } =
      await resolveAuthenticatedSessionUser(supabase);
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify user has access to workspace
    const membership = await verifyWorkspaceMembershipType({
      wsId: wsId,
      userId: user.id,
      supabase: supabase,
    });

    if (membership.error === 'membership_lookup_failed') {
      return NextResponse.json(
        { error: 'Failed to verify workspace membership' },
        { status: 500 }
      );
    }

    if (!membership.ok) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Determine archived filter
    const archivedParam = new URL(request.url).searchParams.get('archived');
    const archived = archivedParam === '1' || archivedParam === 'true';

    // Fetch notes
    let query = supabase
      .from('notes')
      .select('*')
      .eq('ws_id', wsId)
      .eq('creator_id', user.id);

    query = archived ? query.eq('archived', true) : query.eq('archived', false);

    const { data: notes, error: notesError } = await query.order('created_at', {
      ascending: false,
    });

    if (notesError) {
      console.error('Error fetching notes:', notesError);
      return NextResponse.json(
        { error: 'Failed to fetch notes' },
        { status: 500 }
      );
    }

    return NextResponse.json(notes || []);
  } catch (error) {
    console.error('Error in GET /api/v1/workspaces/[wsId]/notes:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ wsId: string }> }
) {
  try {
    const { wsId } = await params;
    const supabase = await createClient();

    // Get current user
    const { user, authError: userError } =
      await resolveAuthenticatedSessionUser(supabase);
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify user has access to workspace
    const membership = await verifyWorkspaceMembershipType({
      wsId,
      userId: user.id,
      supabase,
    });

    if (membership.error === 'membership_lookup_failed') {
      return NextResponse.json(
        { error: 'Failed to verify workspace access' },
        { status: 500 }
      );
    }

    if (!membership.ok) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Parse and validate request body
    const body = await request.json();
    console.log('body', body);
    const { title, content } = createNoteSchema.parse(body);

    // Create note
    const { data: note, error: noteError } = await supabase
      .from('notes')
      .insert({
        title,
        content,
        ws_id: wsId,
        creator_id: user.id,
      })
      .select('*')
      .single();

    if (noteError) {
      console.error('Error creating note:', noteError);
      return NextResponse.json(
        { error: 'Failed to create note' },
        { status: 500 }
      );
    }

    return NextResponse.json(note);
  } catch (error) {
    console.error('Error in POST /api/v1/workspaces/[wsId]/notes:', error);
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
