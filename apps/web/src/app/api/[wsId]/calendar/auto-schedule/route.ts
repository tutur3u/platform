import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { type NextRequest, NextResponse } from 'next/server';
import { createCalendarOptimizer } from './tools';
import {  promoteEventToTask, scheduleWithFlexibleEvents } from '@tuturuuu/ai/scheduling/algorithm';
import { createClient } from '@tuturuuu/supabase/next/server';
import {
  defaultActiveHours,
} from '@tuturuuu/ai/scheduling/default';

import type dayjs from 'dayjs';
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
// export async function POST(
//   request: NextRequest,
//   { params }: { params: Promise<{ wsId: string }> }
// ) {
//   const requestId = Math.random().toString(36).substring(7);
//   console.log(`[AUTO-SCHEDULE-STREAM-${requestId}] Starting POST request`);

//   try {
//     const { wsId } = await params;
//     console.log(`[AUTO-SCHEDULE-STREAM-${requestId}] Workspace ID: ${wsId}`);

//     // Check permissions
//     const { withoutPermission } = await getPermissions({ wsId });
//     if (withoutPermission('manage_calendar')) {
//       return NextResponse.json(
//         { error: 'You do not have permission to manage calendar' },
//         { status: 403 }
//       );
//     }

//     const { searchParams } = new URL(request.url);
//     const streamMode = searchParams.get('stream') !== 'false';
//     const startDate = searchParams.get('startDate');
//     const endDate = searchParams.get('endDate');
//     const dateRange = startDate && endDate ? { startDate, endDate } : undefined;

//     const textBody = await request.text();
//     const body = textBody ? JSON.parse(textBody) : {};
//     const gapMinutes = body.gapMinutes as number | undefined;

//     const optimizer = createCalendarOptimizer(wsId, dateRange);

//     if (streamMode) {
//       const encoder = new TextEncoder();
//       const stream = new ReadableStream({
//         async start(controller) {
//           const writer = (chunk: string) => {
//             try {
//               controller.enqueue(encoder.encode(`data: ${chunk}\\n\\n`));
//             } catch (e) {
//               console.error('Error writing to stream:', e);
//             }
//           };

//           try {
//             await optimizer.optimizeComprehensively(writer, { gapMinutes });
//           } catch (error) {
//             const errorMessage =
//               error instanceof Error ? error.message : 'Unknown error';
//             writer(
//               JSON.stringify({
//                 status: 'error',
//                 message: `An error occurred: ${errorMessage}`,
//               })
//             );
//           } finally {
//             controller.close();
//           }
//         },
//       });

//       return new Response(stream, {
//         headers: {
//           'Content-Type': 'text/event-stream',
//           'Cache-Control': 'no-cache',
//           Connection: 'keep-alive',
//         },
//       });
//     } else {
//       // Non-streaming mode: wait for completion and return a single JSON response
//       let finalResult: any = {};
//       const writer = (chunk: string) => {
//         const data = JSON.parse(chunk);
//         // The last message is the one we want
//         finalResult = data;
//       };

//       await optimizer.optimizeComprehensively(writer, { gapMinutes });
//       return NextResponse.json(finalResult);
//     }
//   } catch (error) {
//     const errorMessage =
//       error instanceof Error ? error.message : 'Unknown error';
//     console.error(
//       `[AUTO-SCHEDULE-${requestId}] Top-level error:`,
//       errorMessage
//     );
//     return NextResponse.json(
//       { error: 'Failed to auto-schedule calendar' },
//       { status: 500 }
//     );
//   }
// }

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ wsId: string }>}
) {
  const supabase = createClient();
  const requestId = Math.random().toString(36).substring(7);


  try {
    const { wsId } = await params;

    // =======================================================
    // 1. PERMISSIONS & REQUEST PARSING
    // =======================================================
    const { withoutPermission } = await getPermissions({ wsId });
    if (withoutPermission('manage_calendar')) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const streamMode = searchParams.get('stream') !== 'false';

    // const body = await request.json().catch(() => ({}));
    // const gapMinutes = (body.gapMinutes as number | undefined) || 0;

    const { data: { user } } = await (await supabase).auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }


    console.log(`[AUTO-SCHEDULE-${requestId}] Fetching tasks and events...`);
    
    // Fetch tasks for the current user
    const { data: currentTasks, error: tasksError } = await (await supabase)
      .from('tasks')
      .select('*')
      .eq('creator_id', user.id) 
      .eq('archived', false) 
      .eq('completed', false); 

    if (tasksError) throw new Error(`Failed to fetch tasks: ${tasksError.message}`);
    
   
    const { data: flexibleEventsData, error: flexibleEventsError } = await (await supabase)
      .from('workspace_calendar_events')
      .select('*')
      .eq('ws_id', wsId);

    if (flexibleEventsError) throw new Error(`Failed to fetch events: ${flexibleEventsError.message}`);

    // Map DB tasks to the format our scheduler understands
    const newTasks: Task[] = await Promise.all(
      (currentTasks || []).map(async task => ({
        id: task.id,
        name: task.name,
        duration: task.total_duration ?? 0,
        minDuration: task.min_split_duration_minutes ? task.min_split_duration_minutes / 60 : 0.5,
        maxDuration: task.max_split_duration_minutes ? task.max_split_duration_minutes / 60 : 2,
        category: 
          task.calendar_hours === 'work_hours' ? 'work' :
          task.calendar_hours === 'personal_hours' ? 'personal' :
          task.calendar_hours === 'meeting_hours' ? 'meeting' :
          'work',
        events: [],
        deadline: task.end_date ? (await import('dayjs')).default(task.end_date) : undefined,
        priority: mapPriorityToTaskPriority(task.priority),
        allowSplit: !!task.is_splittable,
      }))
    );

  
    const dayjs = (await import('dayjs')).default;
    const newFlexibleEvents: Event[] = (flexibleEventsData || []).map(event => ({
      id: event.id,
      name: event.title,
      range: {
        start: dayjs(event.start_at),
        end: dayjs(event.end_at),
      },
      locked: event.locked,
      taskId: event.id ?? '',
      category: 'work', 
    }));

 
    const runSchedulingLogic = async (
      streamUpdate?: (message: object) => void
    ) => {
      // 3. PREPARE DATA FOR THE SCHEDULER
      streamUpdate?.({ status: 'running', message: 'Analyzing schedule...' });
      const lockedEvents: Event[] = [];
      const tasksToProcess = [];

      for (const event of newFlexibleEvents) {
        if (event.locked) {
          lockedEvents.push(event);
        } else {
          // If a flexible event has no task or its task is not in our list,
          // promote it to a low-priority task to be re-scheduled.
          const taskExists = newTasks.some(t => t.id === event.taskId);
          if (!event.taskId || !taskExists) {
            tasksToProcess.push(promoteEventToTask(event));
          }
        }
      }

      const activeHours=defaultActiveHours;

      // 4. RUN THE SCHEDULER TO GET THE OPTIMIZED ORDER
      streamUpdate?.({ status: 'running', message: `Optimizing ${tasksToProcess.length} items...` });
      const scheduleResult = scheduleWithFlexibleEvents(newTasks, newFlexibleEvents, [],activeHours);
      const { events: newScheduledEvents, logs } = scheduleResult;
      
      // console.log(scheduleResult.logs.length, 'logs generated:', scheduleResult.logs);
      console.log(newScheduledEvents.length, 'new scheduled events:', newScheduledEvents);
      // 5. SAVE THE NEW SCHEDULE TO SUPABASE
      streamUpdate?.({ status: 'running', message: 'Saving new schedule...' });
      
      for (const optimization of newScheduledEvents) {
      try {
        const { error } = await (await supabase)
          .from('workspace_calendar_events')
          .update({
            start_at: optimization.range.start.toISOString(),
            end_at: optimization.range.end.toISOString(),
          })
          .eq('id', optimization.id)
          .eq('ws_id', wsId);

          if(error) {
            throw new Error(`Failed to update event ${optimization.id}: ${error.message}`);
          }
      } catch (err) {
        console.error(
          `Failed to apply optimization for event ${optimization.id}:`,
          err
        );
      }
    }
    

      // Prepare new events for insertion
      if (newScheduledEvents.length > 0) {
        const eventsToInsert = newScheduledEvents.map(event => ({
          ws_id: wsId,
          creator_id: user.id,
          task_id: event.taskId,
          title: event.name,
          start_at: event.range.start.toISOString(),
          end_at: event.range.end.toISOString(),
          locked: false, 
          is_past_deadline: event.isPastDeadline,
        }));

        const { error: insertError } = await (await supabase)
          .from('workspace_calendar_events')
          .insert(eventsToInsert);

        if (insertError) throw new Error(`Failed to save new schedule: ${insertError.message}`);
      }

      console.log(`[AUTO-SCHEDULE-${requestId}] Scheduling complete. Logs:`, logs);
      return { message: 'Optimization complete!' };
    };


    if (streamMode) {
      const stream = new ReadableStream({
        async start(controller) {
          const sendData = (data: object) => {
            try {
              controller.enqueue(`data: ${JSON.stringify(data)}\n\n`);
            } catch (e) {
              console.error(`[AUTO-SCHEDULE-${requestId}] Error writing to stream:`, e);
              controller.error(e);
            }
          };

          try {
            await runSchedulingLogic(sendData);
            sendData({ status: 'complete', message: 'Schedule has been optimized!' });
          } catch (e) {
            const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
            sendData({ status: 'error', message: errorMessage });
          } finally {
            controller.close();
          }
        },
      });

      return new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } });
    } else {
      const result = await runSchedulingLogic();
      return NextResponse.json(result);
    }
  } catch (error) {
    console.error(`[AUTO-SCHEDULE-${requestId}] Top-level error:`, error);
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred.';
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
function mapPriorityToTaskPriority(priority: number | null): TaskPriority {
  switch (priority) {
    case 1:
      return 'critical';
    case 2:
      return 'high';
    case 3:
      return 'normal';
    case 4:
      return 'low';
    default:
      return 'normal'; 
  }
}

