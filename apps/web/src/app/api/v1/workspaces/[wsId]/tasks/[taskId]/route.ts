import { createClient } from '@tuturuuu/supabase/next/server';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { wsId: string; taskId: string } }
) {
  try {
    const { taskId } = await params;
    const supabase = await createClient();

    // Get authenticated user (optional, but recommended)
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Defensive: reject if 'tag' (singular) is present
    const body = await request.json();
    if ('tag' in body) {
      return NextResponse.json(
        { error: 'Invalid field: use "tags" (array) instead of "tag".' },
        { status: 400 }
      );
    }

    // Only allow fields you expect (whitelist)
    const allowedFields = [
      'name', 'description', 'priority', 'start_date', 'end_date', 'tags', 'archived'
    ];
    const updates: Record<string, unknown> = {};
    for (const key of allowedFields) {
      if (key in body) updates[key] = body[key];
    }

    // Validate tags if present
    if (
      'tags' in updates &&
      (!Array.isArray(updates.tags) || !updates.tags.every((tag: unknown) => typeof tag === 'string'))
    ) {
      return NextResponse.json(
        { error: 'Tags must be an array of strings.' },
        { status: 400 }
      );
    }

    // Update the task
    const { error } = await supabase
      .from('tasks')
      .update(updates)
      .eq('id', taskId)
      .eq('deleted', false);

    if (error) {
      return NextResponse.json(
        { error: 'Failed to update task.' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 