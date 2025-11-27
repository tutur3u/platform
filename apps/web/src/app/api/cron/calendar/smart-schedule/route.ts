/**
 * Vercel Cron: Smart Schedule
 *
 * Runs the unified scheduler for all workspaces that have auto-schedule
 * enabled habits or tasks. This ensures habits and tasks are scheduled
 * in a coordinated manner:
 * - Habits are scheduled first (by priority)
 * - Tasks are scheduled second (by deadline + priority)
 * - Urgent tasks can bump lower-priority habit events
 *
 * Schedule: Runs every hour at minute 0
 */

import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { type NextRequest, NextResponse } from 'next/server';

export const maxDuration = 300; // 5 minutes max for cron job

export async function GET(req: NextRequest) {
  const cronSecret =
    process.env.CRON_SECRET ?? process.env.VERCEL_CRON_SECRET ?? '';

  if (!cronSecret) {
    return NextResponse.json(
      { ok: false, error: 'CRON_SECRET or VERCEL_CRON_SECRET is not set' },
      { status: 500 }
    );
  }

  if (req.headers.get('Authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { ok: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }

  console.log('=== Starting smart schedule cron job ===');

  try {
    const sbAdmin = await createAdminClient();

    // Get unique workspace IDs that have either:
    // 1. Habits with auto_schedule = true
    // 2. Tasks with auto_schedule = true
    const habitsQuery = sbAdmin
      .from('workspace_habits')
      .select('ws_id')
      .eq('auto_schedule', true)
      .eq('is_active', true);

    const tasksQuery = sbAdmin
      .from('tasks')
      .select('task_lists!inner(workspace_boards!inner(ws_id))')
      .eq('auto_schedule', true)
      .eq('archived', false);

    const [habitsResult, tasksResult] = await Promise.all([
      habitsQuery,
      tasksQuery,
    ]);

    // Combine and deduplicate workspace IDs
    const habitWsIds = habitsResult.data?.map((h) => h.ws_id) ?? [];
    const taskWsIds =
      tasksResult.data?.map(
        (t) =>
          (t.task_lists as unknown as { workspace_boards: { ws_id: string } })
            .workspace_boards.ws_id
      ) ?? [];
    const allWsIds = [...new Set([...habitWsIds, ...taskWsIds])];

    console.log(`Found ${allWsIds.length} workspaces with auto-schedule items`);
    console.log(
      `- ${habitWsIds.length} habits across ${new Set(habitWsIds).size} workspaces`
    );
    console.log(
      `- ${taskWsIds.length} tasks across ${new Set(taskWsIds).size} workspaces`
    );

    if (allWsIds.length === 0) {
      console.log('No workspaces with auto-schedule items found');
      return NextResponse.json({
        ok: true,
        message: 'No workspaces to schedule',
        summary: {
          workspacesProcessed: 0,
          successful: 0,
          failed: 0,
        },
      });
    }

    // Get the base URL
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : process.env.NEXT_PUBLIC_URL || 'http://localhost:7803';

    const results: Array<{
      ws_id: string;
      success: boolean;
      eventsCreated?: number;
      error?: string;
    }> = [];

    // Process workspaces sequentially to avoid overwhelming the API
    // Could be parallelized with Promise.all if needed
    for (const ws_id of allWsIds) {
      try {
        console.log(`[${ws_id}] Scheduling workspace...`);

        const response = await fetch(
          `${baseUrl}/api/v1/workspaces/${ws_id}/calendar/schedule`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${cronSecret}`,
            },
            body: JSON.stringify({
              windowDays: 30,
              forceReschedule: false, // Don't force on regular cron runs
            }),
          }
        );

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        const data = await response.json();

        console.log(`[${ws_id}] Scheduled successfully:`, {
          eventsCreated: data.summary?.eventsCreated,
          habitsScheduled: data.summary?.habitsScheduled,
          tasksScheduled: data.summary?.tasksScheduled,
        });

        results.push({
          ws_id,
          success: true,
          eventsCreated: data.summary?.eventsCreated ?? 0,
        });
      } catch (error) {
        console.error(`[${ws_id}] Error scheduling:`, error);
        results.push({
          ws_id,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    const successful = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;
    const totalEventsCreated = results.reduce(
      (sum, r) => sum + (r.eventsCreated ?? 0),
      0
    );

    console.log('=== Smart schedule cron job completed ===');
    console.log(`Successful: ${successful}, Failed: ${failed}`);
    console.log(`Total events created: ${totalEventsCreated}`);

    return NextResponse.json({
      ok: true,
      message: `Scheduled ${successful}/${allWsIds.length} workspaces`,
      summary: {
        workspacesProcessed: allWsIds.length,
        successful,
        failed,
        totalEventsCreated,
      },
      results,
    });
  } catch (error) {
    console.error('Error in smart schedule cron job:', error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
