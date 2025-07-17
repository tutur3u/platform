import {
  promoteEventToTask,
  scheduleWithFlexibleEvents,
} from '@tuturuuu/ai/scheduling/algorithm';
import { defaultActiveHours } from '@tuturuuu/ai/scheduling/default';
import { createClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import type dayjs from 'dayjs';
import { type NextRequest, NextResponse } from 'next/server';
import { createCalendarOptimizer } from './tools';
export interface DateRange {
  start: dayjs.Dayjs;
  end: dayjs.Dayjs;
}
export interface Event {
  id: string;
  name: string;
  range: DateRange;
  isPastDeadline?: boolean;
  taskId: string;
  partNumber?: number;
  totalParts?: number;
  locked?: boolean;
  category?: 'work' | 'personal' | 'meeting';
}

export type TaskPriority = 'critical' | 'high' | 'normal' | 'low';

export interface Task {
  id: string;
  name: string;
  duration: number;
  minDuration: number;
  maxDuration: number;
  category: 'work' | 'personal' | 'meeting';
  priority: TaskPriority;
  events: Event[];
  deadline?: dayjs.Dayjs;
  allowSplit?: boolean;
}

export interface ActiveHours {
  personal: DateRange[];
  work: DateRange[];
  meeting: DateRange[];
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ wsId: string }> }
) {
  const supabase = createClient();
  const requestId = Math.random().toString(36).substring(7);

  try {
    console.log(`[AUTO-SCHEDULE-${requestId}] Starting POST request`);

    let wsId: string;
    try {
      const resolvedParams = await params;
      wsId = resolvedParams.wsId;
      console.log(`[AUTO-SCHEDULE-${requestId}] Workspace ID: ${wsId}`);
    } catch (error) {
      console.error(
        `[AUTO-SCHEDULE-${requestId}] Failed to resolve params:`,
        error
      );
      return NextResponse.json(
        { error: 'Invalid workspace parameters' },
        { status: 400 }
      );
    }

    // Check permissions
    try {
      const { withoutPermission } = await getPermissions({ wsId });
      if (withoutPermission('manage_calendar')) {
        console.log(`[AUTO-SCHEDULE-${requestId}] Permission denied`);
        return NextResponse.json(
          { error: 'Permission denied' },
          { status: 403 }
        );
      }
    } catch (error) {
      console.error(
        `[AUTO-SCHEDULE-${requestId}] Permission check failed:`,
        error
      );
      return NextResponse.json(
        { error: 'Failed to check permissions' },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(request.url);
    const streamMode = searchParams.get('stream') !== 'false';

    // Authenticate user
    try {
      const {
        data: { user },
      } = await (await supabase).auth.getUser();
      if (!user) {
        console.log(`[AUTO-SCHEDULE-${requestId}] User not authenticated`);
        return NextResponse.json(
          { error: 'Authentication required' },
          { status: 401 }
        );
      }
    } catch (error) {
      console.error(
        `[AUTO-SCHEDULE-${requestId}] Authentication failed:`,
        error
      );
      return NextResponse.json(
        { error: 'Authentication failed' },
        { status: 401 }
      );
    }

    console.log(`[AUTO-SCHEDULE-${requestId}] Fetching tasks and events...`);

    // Fetch flexible events
    try {
      const { data: flexibleEventsData, error: flexibleEventsError } = await (
        await supabase
      )
        .from('workspace_calendar_events')
        .select('*')
        .eq('locked', false)
        .eq('ws_id', wsId);

      if (flexibleEventsError) {
        console.error(
          `[AUTO-SCHEDULE-${requestId}] Failed to fetch events:`,
          flexibleEventsError
        );
        throw new Error(
          `Failed to fetch events: ${flexibleEventsError.message}`
        );
      }

      const newTasks: Task[] = [];
      const dayjs = (await import('dayjs')).default;
      const newFlexibleEvents: Event[] = (flexibleEventsData || []).map(
        (event) => ({
          id: event.id,
          name: event.title,
          range: {
            start: dayjs(event.start_at),
            end: dayjs(event.end_at),
          },
          locked: event.locked,
          priority: event.priority,
          taskId: event.task_id ?? '',
          category: 'work',
        })
      );

      const runSchedulingLogic = async (
        streamUpdate?: (message: object) => void
      ) => {
        try {
          console.log(`[AUTO-SCHEDULE-${requestId}] Starting scheduling logic`);

          // 3. PREPARE DATA FOR THE SCHEDULER
          streamUpdate?.({
            status: 'running',
            message: 'Analyzing schedule...',
          });
          const lockedEvents: Event[] = [];
          const tasksToProcess = [];

          for (const event of newFlexibleEvents) {
            if (event.locked) {
              lockedEvents.push(event);
            } else {
              // If a flexible event has no task or its task is not in our list,
              // promote it to a low-priority task to be re-scheduled.
              const taskExists = newTasks.some((t) => t.id === event.taskId);
              if (!event.taskId || !taskExists) {
                tasksToProcess.push(promoteEventToTask(event));
              }
            }
          }

          const activeHours = defaultActiveHours;

          // 4. RUN THE SCHEDULER TO GET THE OPTIMIZED ORDER
          streamUpdate?.({
            status: 'running',
            message: `Optimizing ${tasksToProcess.length} items...`,
          });
          const scheduleResult = scheduleWithFlexibleEvents(
            newTasks,
            newFlexibleEvents,
            lockedEvents,
            activeHours
          );
          const { events: newScheduledEvents, logs } = scheduleResult;

          // 5. SAVE THE NEW SCHEDULE TO SUPABASE
          streamUpdate?.({
            status: 'running',
            message: 'Saving new schedule...',
          });

          const eventsToInsert = newScheduledEvents.filter(
            (event) =>
              !newFlexibleEvents.some((existing) => existing.id === event.id)
          );

          const eventsToUpsert = newScheduledEvents.map((event) => ({
            id: event.id,
            ws_id: wsId,
            // task_id: event.taskId,
            title: event.name,
            start_at: event.range.start.toISOString(),
            end_at: event.range.end.toISOString(),
            locked: event.locked ?? false,
          }));

          if (eventsToUpsert.length > 0) {
            const { error } = await (await supabase)
              .from('workspace_calendar_events')
              .upsert(eventsToUpsert);

            if (error) {
              console.error(
                `[AUTO-SCHEDULE-${requestId}] Failed to upsert events:`,
                error
              );
              throw new Error(`Failed to save new schedule: ${error.message}`);
            }
          }

          // Prepare new events for insertion
          if (eventsToInsert.length > 0) {
            const insertData = eventsToInsert.map((event) => ({
              ws_id: wsId,
              task_id: event.taskId,
              title: event.name,
              start_at: event.range.start.toISOString(),
              end_at: event.range.end.toISOString(),
              locked: false,
            }));

            const { error: insertError } = await (await supabase)
              .from('workspace_calendar_events')
              .insert(insertData);

            if (insertError) {
              console.error(
                `[AUTO-SCHEDULE-${requestId}] Failed to insert events:`,
                insertError
              );
              throw new Error(
                `Failed to save new schedule: ${insertError.message}`
              );
            }
          }

          console.log(
            `[AUTO-SCHEDULE-${requestId}] Scheduling complete. Logs:`,
            logs
          );
          return { message: 'Optimization complete!' };
        } catch (error) {
          console.error(
            `[AUTO-SCHEDULE-${requestId}] Error in scheduling logic:`,
            error
          );
          throw error;
        }
      };

      if (streamMode) {
        const stream = new ReadableStream({
          async start(controller) {
            const sendData = (data: object) => {
              try {
                controller.enqueue(`data: ${JSON.stringify(data)}\n\n`);
              } catch (e) {
                console.error(
                  `[AUTO-SCHEDULE-${requestId}] Error writing to stream:`,
                  e
                );
                controller.error(e);
              }
            };

            try {
              await runSchedulingLogic(sendData);
              sendData({
                status: 'complete',
                message: 'Schedule has been optimized!',
              });
            } catch (e) {
              const errorMessage =
                e instanceof Error ? e.message : 'An unknown error occurred.';
              console.error(`[AUTO-SCHEDULE-${requestId}] Stream error:`, e);
              sendData({ status: 'error', message: errorMessage });
            } finally {
              try {
                controller.close();
              } catch (closeError) {
                console.error(
                  `[AUTO-SCHEDULE-${requestId}] Error closing stream:`,
                  closeError
                );
              }
            }
          },
        });

        return new Response(stream, {
          headers: { 'Content-Type': 'text/event-stream' },
        });
      } else {
        const result = await runSchedulingLogic();
        return NextResponse.json(result);
      }
    } catch (error) {
      console.error(
        `[AUTO-SCHEDULE-${requestId}] Failed to fetch or process events:`,
        error
      );
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to process events';
      return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
  } catch (error) {
    console.error(`[AUTO-SCHEDULE-${requestId}] Top-level error:`, error);
    const errorMessage =
      error instanceof Error ? error.message : 'An unexpected error occurred.';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ wsId: string }> }
) {
  const requestId = Math.random().toString(36).substring(7);
  console.log(`[HEALTH-CHECK-${requestId}] Starting GET request`);

  try {
    const { wsId } = await params;
    console.log(`[HEALTH-CHECK-${requestId}] Workspace ID: ${wsId}`);

    // Check permissions
    console.log(
      `[HEALTH-CHECK-${requestId}] Checking permissions for workspace: ${wsId}`
    );
    const { withoutPermission } = await getPermissions({ wsId });
    if (withoutPermission('manage_calendar')) {
      console.log(
        `[HEALTH-CHECK-${requestId}] Permission denied for manage_calendar`
      );
      return NextResponse.json(
        { error: 'You do not have permission to manage calendar' },
        { status: 403 }
      );
    }
    console.log(`[HEALTH-CHECK-${requestId}] Permissions check passed`);

    // Get date range parameters for health check
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    const dateRange = startDate && endDate ? { startDate, endDate } : undefined;
    console.log(`[HEALTH-CHECK-${requestId}] Date range:`, dateRange);

    // Create optimizer for health analysis
    console.log(
      `[HEALTH-CHECK-${requestId}] Creating calendar optimizer for health analysis`
    );
    const optimizer = createCalendarOptimizer(wsId, dateRange);
    console.log(
      `[HEALTH-CHECK-${requestId}] Optimizer created, starting health analysis`
    );

    const startTime = Date.now();
    const healthResult = await optimizer.analyzeHealth();
    const processingTime = Date.now() - startTime;

    console.log(
      `[HEALTH-CHECK-${requestId}] Health analysis completed in ${processingTime}ms:`,
      healthResult
    );

    const response = {
      success: true,
      health: healthResult,
      algorithm: 'pure_algorithmic',
    };

    console.log(`[HEALTH-CHECK-${requestId}] Sending successful response`);
    return NextResponse.json(response);
  } catch (error) {
    console.error(`[HEALTH-CHECK-${requestId}] Calendar health check error:`, {
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined,
      name: error instanceof Error ? error.name : undefined,
    });

    return NextResponse.json(
      { error: 'Failed to check calendar health' },
      { status: 500 }
    );
  }
}
