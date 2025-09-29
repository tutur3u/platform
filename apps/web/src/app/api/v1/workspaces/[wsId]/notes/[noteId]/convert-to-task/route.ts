import { createClient } from '@tuturuuu/supabase/next/server';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const convertToTaskSchema = z.object({
  listId: z.string().uuid('Invalid list ID'),
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
    const { listId } = convertToTaskSchema.parse(body);

    // Verify note exists in this workspace
    const { data: note, error: noteError } = await supabase
      .from('notes')
      .select('id, content, creator_id, ws_id, archived')
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
    if (note.archived) {
      return NextResponse.json(
        { error: 'Note already converted' },
        { status: 400 }
      );
    }

    // Verify list exists and is accessible
    const { data: list, error: listError } = await supabase
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

    // Verify the list belongs to a board in this workspace
    const { data: board, error: boardError } = await supabase
      .from('workspace_boards')
      .select('id, ws_id')
      .eq('id', list.board_id)
      .eq('ws_id', wsId)
      .single();

    if (boardError || !board) {
      return NextResponse.json({ error: 'Invalid task list' }, { status: 400 });
    }

    // Create task from note content
    const { data: task, error: taskError } = await supabase
      .from('tasks')
      .insert({
        name: note.content.slice(0, 255), // Truncate to fit task name field
        description: note.content.length > 255 ? note.content : null,
        list_id: listId,
        creator_id: user.id,
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

    // Mark the note as converted
    const { error: updateError } = await supabase
      .from('notes')
      .update({
        archived: true,
      })
      .eq('id', noteId);

    if (updateError) {
      console.error('Error updating note after conversion:', updateError);
      // Don't fail the request, just log the error
    }

    return NextResponse.json({
      success: true,
      message: 'Note converted to task successfully',
      data: {
        taskId: task.id,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error(
      'Error in POST /api/v1/workspaces/[wsId]/notes/[noteId]/convert-to-task:',
      error
    );
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
