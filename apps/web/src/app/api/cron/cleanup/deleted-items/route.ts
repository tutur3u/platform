import { createClient } from '@tuturuuu/supabase/next/server';
import { type NextRequest, NextResponse } from 'next/server';

/**
 * Cron job to permanently delete soft-deleted tasks and boards after 30 days
 * Runs hourly to clean up old deleted items
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  // Verify cron secret
  const cronSecret =
    process.env.CRON_SECRET ?? process.env.VERCEL_CRON_SECRET ?? '';

  if (!cronSecret) {
    return NextResponse.json(
      { ok: false, error: 'CRON_SECRET or VERCEL_CRON_SECRET is not set' },
      { status: 500 }
    );
  }

  if (req.headers.get('Authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  try {
    const supabase = await createClient();

    // Calculate the date 30 days ago
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const cutoffDate = thirtyDaysAgo.toISOString();

    // Hard delete tasks that were soft-deleted more than 30 days ago
    const { data: deletedTasks, error: tasksError } = await supabase
      .from('tasks')
      .delete()
      .not('deleted_at', 'is', null)
      .lt('deleted_at', cutoffDate)
      .select('id');

    if (tasksError) {
      console.error('Error deleting old tasks:', tasksError);
      return NextResponse.json(
        {
          ok: false,
          error: 'Failed to delete old tasks',
          details: tasksError.message,
        },
        { status: 500 }
      );
    }

    // Hard delete boards that were soft-deleted more than 30 days ago
    const { data: deletedBoards, error: boardsError } = await supabase
      .from('workspace_boards')
      .delete()
      .not('deleted_at', 'is', null)
      .lt('deleted_at', cutoffDate)
      .select('id');

    if (boardsError) {
      console.error('Error deleting old boards:', boardsError);
      return NextResponse.json(
        {
          ok: false,
          error: 'Failed to delete old boards',
          details: boardsError.message,
        },
        { status: 500 }
      );
    }

    const tasksDeleted = deletedTasks?.length ?? 0;
    const boardsDeleted = deletedBoards?.length ?? 0;

    console.log(
      `Cleanup completed: ${tasksDeleted} tasks and ${boardsDeleted} boards permanently deleted`
    );

    return NextResponse.json({
      ok: true,
      message: 'Cleanup completed successfully',
      deleted: {
        tasks: tasksDeleted,
        boards: boardsDeleted,
        total: tasksDeleted + boardsDeleted,
      },
      cutoffDate,
    });
  } catch (error) {
    console.error('Error in cleanup cron job:', error);
    return NextResponse.json(
      {
        ok: false,
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
