import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { type NextRequest, NextResponse } from 'next/server';
import { createCalendarOptimizer } from './tools';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ wsId: string }> }
) {
  const requestId = Math.random().toString(36).substring(7);
  console.log(`[AUTO-SCHEDULE-STREAM-${requestId}] Starting POST request`);

  try {
    const { wsId } = await params;
    console.log(`[AUTO-SCHEDULE-STREAM-${requestId}] Workspace ID: ${wsId}`);

    // Check permissions
    const { withoutPermission } = await getPermissions({ wsId });
    if (withoutPermission('manage_calendar')) {
      return NextResponse.json(
        { error: 'You do not have permission to manage calendar' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const streamMode = searchParams.get('stream') !== 'false';
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const dateRange = startDate && endDate ? { startDate, endDate } : undefined;

    const textBody = await request.text();
    const body = textBody ? JSON.parse(textBody) : {};
    const gapMinutes = body.gapMinutes as number | undefined;

    const optimizer = createCalendarOptimizer(wsId, dateRange);

    if (streamMode) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          const writer = (chunk: string) => {
            try {
              controller.enqueue(encoder.encode(`data: ${chunk}\\n\\n`));
            } catch (e) {
              console.error('Error writing to stream:', e);
            }
          };

          try {
            await optimizer.optimizeComprehensively(writer, { gapMinutes });
          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : 'Unknown error';
            writer(
              JSON.stringify({
                status: 'error',
                message: `An error occurred: ${errorMessage}`,
              })
            );
          } finally {
            controller.close();
          }
        },
      });

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
      });
    } else {
      // Non-streaming mode: wait for completion and return a single JSON response
      let finalResult: any = {};
      const writer = (chunk: string) => {
        const data = JSON.parse(chunk);
        // The last message is the one we want
        finalResult = data;
      };

      await optimizer.optimizeComprehensively(writer, { gapMinutes });
      return NextResponse.json(finalResult);
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    console.error(
      `[AUTO-SCHEDULE-${requestId}] Top-level error:`,
      errorMessage
    );
    return NextResponse.json(
      { error: 'Failed to auto-schedule calendar' },
      { status: 500 }
    );
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
