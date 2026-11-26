import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { type NextRequest, NextResponse } from 'next/server';
import {
  runTaskMediaCleanup,
  taskMediaCleanupMode,
} from '@/lib/task-media-cleanup-run';

export const maxDuration = 300;

// Cron Control job `tasks-cleanup-media`. TASKS_MEDIA_CLEANUP_MODE must be
// exactly `delete` to remove files and `off` stops the job; any other value,
// including unset, only counts what a pass would remove.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET ?? process.env.VERCEL_CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: 'Cron secret is not configured' },
      { status: 500 }
    );
  }
  if (request.headers.get('Authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const mode = taskMediaCleanupMode(process.env.TASKS_MEDIA_CLEANUP_MODE);
  if (mode === 'off') return NextResponse.json({ mode });

  try {
    const report = await runTaskMediaCleanup(
      await createAdminClient({ noCookie: true }),
      { mode }
    );
    // Cron Control keeps only the outcome, so the pass counts live in the log.
    console.info('Task media cleanup pass', report);
    return NextResponse.json(report, { status: report.failed ? 500 : 200 });
  } catch (error) {
    console.error('Failed to clean up orphan task media:', error);
    return NextResponse.json(
      { error: 'Failed to clean up orphan task media' },
      { status: 500 }
    );
  }
}
