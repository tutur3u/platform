import { createClient } from '@tuturuuu/supabase/next/server';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const createNoteSchema = z.object({
  content: z
    .string()
    .min(1, 'Content is required')
    .max(10000, 'Content too long'),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ wsId: string }> }
) {
  try {
    const { wsId } = await params;
    const supabase = await createClient();

    // Get current user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify user has access to workspace
    const { data: membership } = await supabase
      .from('workspace_members')
      .select('ws_id')
      .eq('ws_id', wsId)
      .eq('user_id', user.id)
      .single();

    if (!membership) {
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
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify user has access to workspace
    const { data: membership } = await supabase
      .from('workspace_members')
      .select('ws_id')
      .eq('ws_id', wsId)
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Parse and validate request body
    const body = await request.json();
    const { content } = createNoteSchema.parse(body);

    // Create note
    const { data: note, error: noteError } = await supabase
      .from('notes')
      .insert({
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
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('Error in POST /api/v1/workspaces/[wsId]/notes:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
