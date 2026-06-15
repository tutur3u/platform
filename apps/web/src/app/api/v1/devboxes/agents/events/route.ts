import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeDevboxAgent } from '@/lib/devboxes/agent-auth';
import {
  completeDevboxRun,
  recordDevboxRunEvents,
} from '@/lib/devboxes/agent-store';
import { createDevboxRouteErrorResponse } from '@/lib/devboxes/store-utils';

const AgentEventSchema = z.object({
  completion: z
    .object({
      exitCode: z.number().int(),
      status: z.enum(['cancelled', 'failed', 'succeeded']),
    })
    .optional(),
  events: z
    .array(
      z.object({
        eventType: z.string().trim().min(1).optional(),
        message: z.string().optional(),
        metadata: z.record(z.string(), z.unknown()).optional(),
      })
    )
    .optional(),
  runId: z.string().trim().min(1),
});

export async function POST(request: Request) {
  const authorization = await authorizeDevboxAgent(request, {
    requireOnline: true,
  });
  if (!authorization.ok) return authorization.response;

  const parsed = AgentEventSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success) {
    return NextResponse.json(
      { errors: parsed.error.issues, message: 'Invalid request body' },
      { status: 400 }
    );
  }

  try {
    const events = parsed.data.events?.length
      ? await recordDevboxRunEvents({
          events: parsed.data.events,
          runId: parsed.data.runId,
          runnerId: authorization.runner.id,
        })
      : { events: 0 };
    const completion = parsed.data.completion
      ? await completeDevboxRun({
          ...parsed.data.completion,
          runId: parsed.data.runId,
          runnerId: authorization.runner.id,
        })
      : null;

    return NextResponse.json({
      completion,
      events: events.events,
      message: 'events accepted',
    });
  } catch (error) {
    return createDevboxRouteErrorResponse(
      error,
      'Failed to record devbox events'
    );
  }
}
