import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { DEV_MODE, ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

/**
 * Vercel Cron Job: Process Task Deadline Reminders
 *
 * This endpoint runs every 5 minutes to check for tasks with approaching due dates
 * and sends reminder notifications to all watchers.
 *
 * Schedule: every 5 minutes (cron: 0/5 * * * *)
 */

// Interval string to milliseconds mapping
const INTERVAL_TO_MS: Record<string, number> = {
  '30m': 30 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '2h': 2 * 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '12h': 12 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '1d': 24 * 60 * 60 * 1000,
  '2d': 2 * 24 * 60 * 60 * 1000,
  '3d': 3 * 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
};

// Human-readable interval names
const INTERVAL_NAMES: Record<string, string> = {
  '30m': '30 minutes',
  '1h': '1 hour',
  '2h': '2 hours',
  '6h': '6 hours',
  '12h': '12 hours',
  '24h': '24 hours',
  '1d': '1 day',
  '2d': '2 days',
  '3d': '3 days',
  '7d': '1 week',
};

// Feature flag: When true, only process reminders for the root workspace
const RESTRICT_TO_ROOT_WORKSPACE_ONLY = true;

interface TaskWithDetails {
  id: string;
  name: string;
  end_date: string;
  task_lists: {
    board_id: string;
    workspace_boards: {
      id: string;
      name: string;
      ws_id: string;
    };
  };
  task_watchers: Array<{ user_id: string }>;
}

interface ReminderSettings {
  ws_id: string;
  reminder_intervals: string[];
  enabled: boolean;
}

export async function GET(req: NextRequest) {
  try {
    // Verify authorization
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const sbAdmin = await createAdminClient();
    const now = new Date();

    // Get all workspaces with reminder settings
    // Note: Types for new tables will be available after running bun sb:typegen
    let settingsQuery = (sbAdmin as any)
      .from('workspace_task_reminder_settings')
      .select('ws_id, reminder_intervals, enabled')
      .eq('enabled', true);

    if (RESTRICT_TO_ROOT_WORKSPACE_ONLY) {
      settingsQuery = settingsQuery.eq('ws_id', ROOT_WORKSPACE_ID);
    }

    const { data: allSettings, error: settingsError } =
      (await settingsQuery) as {
        data: ReminderSettings[] | null;
        error: Error | null;
      };

    if (settingsError) {
      console.error('Error fetching reminder settings:', settingsError);
      return NextResponse.json(
        { error: 'Error fetching settings' },
        { status: 500 }
      );
    }

    // Build a map of workspace settings for quick lookup
    const settingsMap = new Map<string, ReminderSettings>();
    for (const setting of allSettings || []) {
      settingsMap.set(setting.ws_id, setting as ReminderSettings);
    }

    // Calculate the maximum window we need to check
    // Default intervals are 24h and 1h if no settings
    const defaultIntervals = ['24h', '1h'];
    const allIntervals = new Set<string>(defaultIntervals);
    for (const setting of allSettings || []) {
      const intervals = setting.reminder_intervals as string[];
      if (intervals) {
        for (const interval of intervals) {
          allIntervals.add(interval);
        }
      }
    }

    const maxIntervalMs = Math.max(
      ...[...allIntervals].map((i) => INTERVAL_TO_MS[i] || 0)
    );
    const windowEnd = new Date(now.getTime() + maxIntervalMs + 5 * 60 * 1000); // +5min buffer

    // Get tasks with due dates in the window
    // Note: task_watchers relation will be available after running migrations
    let tasksQuery = (sbAdmin as any)
      .from('tasks')
      .select(
        `
        id,
        name,
        end_date,
        task_lists!inner (
          board_id,
          workspace_boards!inner (
            id,
            name,
            ws_id
          )
        ),
        task_watchers (
          user_id
        )
      `
      )
      .not('end_date', 'is', null)
      .is('completed_at', null)
      .is('deleted_at', null)
      .gte('end_date', now.toISOString())
      .lte('end_date', windowEnd.toISOString());

    if (RESTRICT_TO_ROOT_WORKSPACE_ONLY) {
      tasksQuery = tasksQuery.eq(
        'task_lists.workspace_boards.ws_id',
        ROOT_WORKSPACE_ID
      );
    }

    const { data: tasks, error: tasksError } = (await tasksQuery) as {
      data: TaskWithDetails[] | null;
      error: Error | null;
    };

    if (tasksError) {
      console.error('Error fetching tasks:', tasksError);
      return NextResponse.json(
        { error: 'Error fetching tasks' },
        { status: 500 }
      );
    }

    if (!tasks || tasks.length === 0) {
      return NextResponse.json({
        message: 'No tasks with approaching deadlines',
        processed: 0,
        notificationsSent: 0,
      });
    }

    let notificationsSent = 0;
    let tasksProcessed = 0;
    const results: Array<{
      task_id: string;
      task_name: string;
      notifications_sent: number;
    }> = [];

    for (const task of tasks) {
      const taskEndDate = new Date(task.end_date);
      const timeUntilDue = taskEndDate.getTime() - now.getTime();
      const watchers = task.task_watchers || [];
      const boardInfo = task.task_lists?.workspace_boards;

      if (!boardInfo || watchers.length === 0) continue;

      const wsId = boardInfo.ws_id;

      // Get workspace-specific intervals or use defaults
      const settings = settingsMap.get(wsId);
      const intervals: string[] =
        settings?.reminder_intervals || defaultIntervals;

      let taskNotifications = 0;

      // Check each interval to see if we should send a reminder
      for (const interval of intervals) {
        const intervalMs = INTERVAL_TO_MS[interval];
        if (!intervalMs) continue;

        // Check if we're within the reminder window (interval time +/- 5 minutes)
        const windowStart = intervalMs - 5 * 60 * 1000;
        const windowEnd = intervalMs + 5 * 60 * 1000;

        if (timeUntilDue >= windowStart && timeUntilDue <= windowEnd) {
          // Send reminder to each watcher
          for (const watcher of watchers) {
            // Check if already sent
            // Note: task_reminder_sent types will be available after running bun sb:typegen
            const { data: existingReminder } = await (sbAdmin as any)
              .from('task_reminder_sent')
              .select('id')
              .eq('task_id', task.id)
              .eq('user_id', watcher.user_id)
              .eq('reminder_interval', interval)
              .maybeSingle();

            if (existingReminder) continue; // Already sent

            // Check notification preferences
            const { data: shouldSend } = await sbAdmin.rpc(
              'should_send_notification',
              {
                p_user_id: watcher.user_id,
                p_event_type: 'deadline_reminder',
                p_channel: 'email',
                p_scope: 'workspace',
                p_ws_id: wsId,
              }
            );

            if (!shouldSend) continue;

            // Build task URL
            const baseUrl =
              process.env.NEXT_PUBLIC_APP_URL || 'https://tuturuuu.com';
            const taskUrl = `${baseUrl}/${wsId}/tasks/boards/${boardInfo.id}?task=${task.id}`;

            // Create notification using the database function
            const { data: notificationId, error: notifError } =
              await sbAdmin.rpc('create_notification', {
                p_ws_id: wsId,
                p_user_id: watcher.user_id,
                p_type: 'deadline_reminder',
                p_title: `Task due in ${INTERVAL_NAMES[interval] || interval}`,
                p_description: `"${task.name}" is due soon`,
                p_data: {
                  task_id: task.id,
                  task_name: task.name,
                  board_id: boardInfo.id,
                  board_name: boardInfo.name,
                  end_date: task.end_date,
                  reminder_interval: INTERVAL_NAMES[interval] || interval,
                  task_url: taskUrl,
                },
                p_entity_type: 'task',
                p_entity_id: task.id,
                p_scope: 'workspace',
                p_priority: 'high',
              });

            if (notifError) {
              console.error(
                `Error creating notification for task ${task.id}:`,
                notifError
              );
              continue;
            }

            // Record that we sent this reminder
            const { error: trackError } = await (sbAdmin as any)
              .from('task_reminder_sent')
              .insert({
                task_id: task.id,
                user_id: watcher.user_id,
                reminder_interval: interval,
                notification_id: notificationId,
              });

            if (trackError) {
              console.error(
                `Error tracking reminder for task ${task.id}:`,
                trackError
              );
            }

            notificationsSent++;
            taskNotifications++;

            if (DEV_MODE) {
              console.log(
                `[DEBUG] Sent ${interval} reminder for task "${task.name}" to user ${watcher.user_id}`
              );
            }
          }
        }
      }

      if (taskNotifications > 0) {
        tasksProcessed++;
        results.push({
          task_id: task.id,
          task_name: task.name,
          notifications_sent: taskNotifications,
        });
      }
    }

    return NextResponse.json({
      message: 'Deadline reminders processed',
      tasksChecked: tasks.length,
      tasksProcessed,
      notificationsSent,
      results,
    });
  } catch (error) {
    console.error('Error in deadline reminders cron:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
