import { createClient } from '@tuturuuu/supabase/next/server';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const cycleStatusSchema = z.enum([
  'planned',
  'active',
  'completed',
  'cancelled',
]);

const updateCycleSchema = z.object({
  name: z.string().min(1, 'Cycle name is required').max(255),
  description: z.string().max(1000).optional(),
  status: cycleStatusSchema,
  start_date: z
    .string()
    .optional()
    .nullable()
    .transform((val) => (val?.trim() ? val : null)),
  end_date: z
    .string()
    .optional()
    .nullable()
    .transform((val) => (val?.trim() ? val : null)),
});

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ wsId: string; cycleId: string }> }
) {
  try {
    const { wsId, cycleId } = await params;
    const supabase = await createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: membership } = await supabase
      .from('workspace_members')
      .select('ws_id')
      .eq('ws_id', wsId)
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const parsed = updateCycleSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed?.error.message || 'Invalid input' },
        { status: 400 }
      );
    }
    const { name, description, status, start_date, end_date } = parsed.data;

    const { data: updatedCycle, error } = await supabase
      .from('task_cycles')
      .update({
        name,
        description: description || null,
        status,
        start_date: start_date ? start_date : null,
        end_date: end_date ? end_date : null,
      })
      .eq('id', cycleId)
      .eq('ws_id', wsId)
      .select(
        `
          *,
          creator:users!task_cycles_creator_id_fkey(
            id,
            display_name,
            avatar_url
          ),
          task_cycle_tasks(
            task_id
          )
        `
      )
      .single();

    if (error || !updatedCycle) {
      console.error('Error updating cycle:', error);
      return NextResponse.json(
        { error: 'Failed to update cycle' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      id: updatedCycle.id,
      name: updatedCycle.name,
      description: updatedCycle.description,
      status: updatedCycle.status,
      start_date: updatedCycle.start_date,
      end_date: updatedCycle.end_date,
      created_at: updatedCycle.created_at,
      creator: updatedCycle.creator,
      tasksCount: updatedCycle.task_cycle_tasks?.length ?? 0,
    });
  } catch (error) {
    console.error(
      'Error in PUT /api/v1/workspaces/[wsId]/task-cycles/[cycleId]:',
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
  { params }: { params: Promise<{ wsId: string; cycleId: string }> }
) {
  try {
    const { wsId, cycleId } = await params;
    const supabase = await createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: membership } = await supabase
      .from('workspace_members')
      .select('ws_id')
      .eq('ws_id', wsId)
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { error } = await supabase
      .from('task_cycles')
      .delete()
      .eq('id', cycleId)
      .eq('ws_id', wsId);

    if (error) {
      console.error('Error deleting cycle:', error);
      return NextResponse.json(
        { error: 'Failed to delete cycle' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(
      'Error in DELETE /api/v1/workspaces/[wsId]/task-cycles/[cycleId]:',
      error
    );
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
