import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { DEV_MODE } from '@tuturuuu/utils/constants';
import { isTaskBoardResolvedStatus } from '@tuturuuu/utils/task-list-status';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withCronLogDrain } from '@/lib/infrastructure/log-drain';

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
  '3h': 3 * 60 * 60 * 1000,
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
  '3h': '3 hours',
  '6h': '6 hours',
  '12h': '12 hours',
  '24h': '24 hours',
  '1d': '1 day',
  '2d': '2 days',
  '3d': '3 days',
  '7d': '1 week',
};

const DEFAULT_INTERVALS = ['3d', '1d', '12h', '3h', '1h'];
const PAGE_SIZE = 500;

interface TaskWithDetails {
  id: string;
  name: string;
  end_date: string;
  closed_at: string | null;
  completed_at: string | null;
  task_lists: {
    board_id: string;
    status: string | null;
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

interface DeadlineReminderTaskState {
  closed_at: string | null;
  completed_at: string | null;
  task_lists?: {
    status: string | null;
  } | null;
}

export function shouldSkipDeadlineReminderTask(
  task: DeadlineReminderTaskState
) {
  const listStatus = task.task_lists?.status;

  return (
    Boolean(task.completed_at) ||
    Boolean(task.closed_at) ||
    isTaskBoardResolvedStatus(listStatus)
  );
}

export async function GET(req: NextRequest) {
  return withCronLogDrain(
    {
      jobId: 'tasks-deadline-reminders',
      path: '/api/cron/tasks/deadline-reminders',
      request: req,
    },
    () => handleGET(req)
  );
}

async function handleGET(req: NextRequest) {
  try {
    // Verify authorization
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const sbAdmin = await createAdminClient();
    const now = new Date();

    // Workspace settings override the defaults, including when reminders are disabled.
    const allSettings: ReminderSettings[] = [];
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const { data, error } = (await (sbAdmin as any)
        .from('workspace_task_reminder_settings')
        .select('ws_id, reminder_intervals, enabled')
        .order('ws_id')
        .range(offset, offset + PAGE_SIZE - 1)) as {
        data: ReminderSettings[] | null;
        error: Error | null;
      };
      if (error) {
        console.error('Error fetching reminder settings:', error);
        return NextResponse.json(
          { error: 'Error fetching settings' },
          { status: 500 }
        );
      }
      allSettings.push(...(data ?? []));
      if (!data || data.length < PAGE_SIZE) break;
    }

    // Build a map of workspace settings for quick lookup
    const settingsMap = new Map<string, ReminderSettings>();
    for (const setting of allSettings) {
      settingsMap.set(setting.ws_id, setting as ReminderSettings);
    }

    // Calculate the maximum window we need to check
    const allIntervals = new Set<string>(DEFAULT_INTERVALS);
    for (const setting of allSettings) {
      if (!setting.enabled) continue;
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

    // Only due-soon active tasks enter the reminder scan.
    const tasks: TaskWithDetails[] = [];
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const { data, error } = (await (sbAdmin as any)
        .from('tasks')
        .select(
          `
        id,
        name,
        end_date,
        closed_at,
        completed_at,
        task_lists!inner (
          board_id,
          status,
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
        .is('closed_at', null)
        .is('deleted_at', null)
        .gte('end_date', now.toISOString())
        .lte('end_date', windowEnd.toISOString())
        .order('end_date')
        .order('id')
        .range(offset, offset + PAGE_SIZE - 1)) as {
        data: TaskWithDetails[] | null;
        error: Error | null;
      };
      if (error) {
        console.error('Error fetching tasks:', error);
        return NextResponse.json(
          { error: 'Error fetching tasks' },
          { status: 500 }
        );
      }
      tasks.push(...(data ?? []));
      if (!data || data.length < PAGE_SIZE) break;
    }

    if (tasks.length === 0) {
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
      if (shouldSkipDeadlineReminderTask(task)) continue;

      const wsId = boardInfo.ws_id;

      // Get workspace-specific intervals or use defaults
      const settings = settingsMap.get(wsId);
      if (settings?.enabled === false) continue;
      const intervals: string[] =
        settings?.reminder_intervals || DEFAULT_INTERVALS;

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
            // A changed due date should receive a fresh reminder at its new time.
            const receiptKey = `${interval}:${task.end_date}`;
            const { data: reminderAlreadySent, error: reminderCheckError } =
              await sbAdmin.rpc('task_reminder_already_sent', {
                p_task_id: task.id,
                p_user_id: watcher.user_id,
                p_reminder_interval: receiptKey,
              });

            if (reminderCheckError) {
              console.error(
                `Error checking reminder tracking for task ${task.id}:`,
                reminderCheckError
              );
              continue;
            }

            if (reminderAlreadySent) continue;

            // Build task URL
            const baseUrl =
              process.env.NEXT_PUBLIC_APP_URL || 'https://tuturuuu.com';
            const taskUrl = `${baseUrl}/${wsId}/boards/${boardInfo.id}?task=${task.id}`;

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

            if (!notificationId) continue;

            const { error: trackError } = await sbAdmin.rpc(
              'record_task_reminder_sent',
              {
                p_task_id: task.id,
                p_user_id: watcher.user_id,
                p_reminder_interval: receiptKey,
                p_notification_id: notificationId,
              }
            );

            if (trackError) {
              console.error(
                `Error tracking reminder for task ${task.id}:`,
                trackError
              );
            }

            notificationsSent++;
            taskNotifications++;

            if (DEV_MODE) {
              console.info(
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
