import { createClient } from '@tuturuuu/supabase/next/server';
import { getCurrentSupabaseUser } from '@tuturuuu/utils/user-helper';
import { sendTaskAssignmentNotification } from '@tuturuuu/trigger/task-assignment-notification';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const notifyAssignmentSchema = z.object({
  assignee_user_id: z.string().uuid(),
  ws_id: z.string(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const { taskId } = await params;
    const user = await getCurrentSupabaseUser();

    // 1. Authenticate the user
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Parse and validate the request body
    const body = await req.json();
    const parseResult = notifyAssignmentSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: 'Invalid request body',
          details: parseResult.error.issues,
        },
        { status: 400 }
      );
    }

    const { assignee_user_id, ws_id } = parseResult.data;

    // 3. Verify the task exists and the user has access
    const supabase = await createClient();
    const { data: task, error: taskError } = await supabase
      .from('tasks')
      .select('id, name')
      .eq('id', taskId)
      .single();

    if (taskError || !task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    // 4. Verify the assignment exists
    const { data: assignment, error: assignmentError } = await supabase
      .from('task_assignees')
      .select('*')
      .eq('task_id', taskId)
      .eq('user_id', assignee_user_id)
      .single();

    if (assignmentError || !assignment) {
      return NextResponse.json(
        { error: 'Assignment not found' },
        { status: 404 }
      );
    }

    // 5. Don't send notification if the assignee is the same as the assigner
    if (assignee_user_id === user.id) {
      return NextResponse.json(
        {
          message: 'No notification sent (self-assignment)',
          skipped: true,
        },
        { status: 200 }
      );
    }

    // 6. Trigger the notification asynchronously
    await sendTaskAssignmentNotification.trigger(
      {
        task_id: taskId,
        assignee_user_id,
        assigned_by_user_id: user.id,
        ws_id,
      },
      {
        // Use a unique idempotency key to prevent duplicate notifications
        idempotencyKey: `task-assignment-${taskId}-${assignee_user_id}-${Date.now()}`,
      }
    );

    return NextResponse.json(
      {
        message: 'Notification triggered successfully',
        task_id: taskId,
        assignee_user_id,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error in notify assignment route:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
