import { createClient } from '@tuturuuu/supabase/next/server';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

// TipTap JSONContent schema for rich text
const jsonContentSchema: z.ZodType<any> = z.lazy(() =>
  z.object({
    type: z.string(),
    attrs: z.record(z.string(), z.any()).optional(),
    content: z.array(jsonContentSchema).optional(),
    marks: z.array(z.any()).optional(),
    text: z.string().optional(),
  })
);

const updateNoteSchema = z.object({
  title: z.string().optional(),
  content: jsonContentSchema
    .refine(
      (val) => val.type === 'doc',
      'Content must be a valid TipTap document'
    )
    .optional(),
});

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ wsId: string; noteId: string }> }
) {
  try {
    const { wsId, noteId } = await params;
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
    const { title, content } = updateNoteSchema.parse(body);

    // Update note
    const { data: updatedNote, error: updateError } = await supabase
      .from('notes')
      .update({ title, content })
      .eq('id', noteId)
      .eq('ws_id', wsId)
      .eq('creator_id', user.id)
      .select('*')
      .single();

    if (updateError) {
      console.error('Error updating note:', updateError);
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
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error(
      'Error in PUT /api/v1/workspaces/[wsId]/notes/[noteId]:',
      error
    );
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ wsId: string; noteId: string }> }
) {
  try {
    const { wsId, noteId } = await params;
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

    // Delete note
    const { error: deleteError } = await supabase
      .from('notes')
      .delete()
      .eq('id', noteId)
      .eq('ws_id', wsId)
      .eq('creator_id', user.id);

    if (deleteError) {
      console.error('Error deleting note:', deleteError);
      return NextResponse.json(
        { error: 'Failed to delete note' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(
      'Error in DELETE /api/v1/workspaces/[wsId]/notes/[noteId]:',
      error
    );
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
