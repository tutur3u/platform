import { createClient } from '@tuturuuu/supabase/next/server';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const convertToProjectSchema = z.object({
  name: z
    .string()
    .min(1, 'Project name is required')
    .max(255, 'Project name too long'),
  description: z.string().max(1000, 'Description too long').optional(),
});

export async function POST(
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
    const { name, description } = convertToProjectSchema.parse(body);

    // Verify note exists in this workspace
    const { data: note, error: noteError } = await supabase
      .from('notes')
      .select('id, content, creator_id, ws_id, is_converted')
      .eq('id', noteId)
      .eq('ws_id', wsId)
      .single();

    if (noteError || !note) {
      return NextResponse.json({ error: 'Note not found' }, { status: 404 });
    }

    // Only the creator can convert the note
    if (note.creator_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Check if note is already converted
    if (note.is_converted) {
      return NextResponse.json(
        { error: 'Note already converted' },
        { status: 400 }
      );
    }

    // Create task project
    const { data: project, error: projectError } = await supabase
      .from('task_projects')
      .insert({
        name,
        description: description || null,
        ws_id: wsId,
        creator_id: user.id,
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

    // Mark the note as converted
    const { error: updateError } = await supabase
      .from('notes')
      .update({
        is_converted: true,
        converted_to_project_id: project.id,
      })
      .eq('id', noteId);

    if (updateError) {
      console.error('Error updating note after conversion:', updateError);
      // Don't fail the request, just log the error
    }

    return NextResponse.json({
      success: true,
      message: 'Note converted to project successfully',
      data: {
        projectId: project.id,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.errors[0].message },
        { status: 400 }
      );
    }
    console.error(
      'Error in POST /api/v1/workspaces/[wsId]/notes/[noteId]/convert-to-project:',
      error
    );
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
