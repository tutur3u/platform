import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  callPrivateMeetRpc,
  loadMeetPlanSnapshot,
  resolveOptionalMeetActor,
} from '../_lib/snapshot';

const payloadSchema = z.object({
  timeframes: z
    .array(
      z.object({
        startAt: z.string().datetime({ offset: true }),
        endAt: z.string().datetime({ offset: true }),
      })
    )
    .min(1)
    .max(32),
});

interface RouteContext {
  params: Promise<{ planId: string }>;
}

async function mutateFinalization(
  request: NextRequest,
  context: RouteContext,
  timeframes: Array<{ startAt: string; endAt: string }>
) {
  const { planId } = await context.params;
  const actor = await resolveOptionalMeetActor(request);
  if (!actor) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const snapshot = await loadMeetPlanSnapshot(request, planId, actor);
  if (!snapshot) {
    return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
  }
  if (!snapshot.viewer.isCreator) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const result = await callPrivateMeetRpc('replace_meet_finalized_timeframes', {
    p_plan_id: snapshot.plan.id,
    p_actor_id: actor.id,
    p_timeframes: timeframes.map((timeframe, position) => ({
      start_at: timeframe.startAt,
      end_at: timeframe.endAt,
      position,
    })),
  });
  if (result.error) {
    console.error('Failed to update Meet finalization', {
      message: result.error.message,
      planId,
    });
    return NextResponse.json(
      { error: 'Unable to update final timeframes' },
      { status: 400 }
    );
  }

  const updated = await loadMeetPlanSnapshot(request, planId, actor);
  return NextResponse.json(updated, {
    headers: { 'Cache-Control': 'private, no-store' },
  });
}

export async function PUT(request: NextRequest, context: RouteContext) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: 'Malformed JSON' }, { status: 400 });
  }
  const parsed = payloadSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid final timeframes' },
      { status: 400 }
    );
  }
  return mutateFinalization(request, context, parsed.data.timeframes);
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  return mutateFinalization(request, context, []);
}
