import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  callPrivateMeetRpc,
  loadMeetPlanSnapshot,
  resolveOptionalMeetActor,
} from '../_lib/snapshot';

const payloadSchema = z.object({
  guestId: z.string().uuid().optional(),
  passwordHash: z.string().min(1).max(512).optional(),
  timeblocks: z
    .array(
      z.object({
        date: z.string().date(),
        start_time: z.string().min(4).max(32),
        end_time: z.string().min(4).max(32),
        tentative: z.boolean().optional(),
      })
    )
    .max(512),
});

interface RouteContext {
  params: Promise<{ planId: string }>;
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const { planId } = await context.params;
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: 'Malformed JSON' }, { status: 400 });
  }

  const parsed = payloadSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid availability' },
      { status: 400 }
    );
  }

  const actor = await resolveOptionalMeetActor(request);
  const snapshot = await loadMeetPlanSnapshot(request, planId, actor);
  if (!snapshot?.plan.id) {
    return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
  }
  let userId = actor?.id;
  let isGuest = false;

  if (parsed.data.guestId || parsed.data.passwordHash) {
    if (!parsed.data.guestId || !parsed.data.passwordHash) {
      return NextResponse.json(
        { error: 'Guest credentials are incomplete' },
        { status: 401 }
      );
    }
    const admin = await createAdminClient();
    const { data: guest } = await admin
      .from('meet_together_guests')
      .select('id')
      .eq('id', parsed.data.guestId)
      .eq('plan_id', snapshot.plan.id)
      .eq('password_hash', parsed.data.passwordHash)
      .maybeSingle();
    if (!guest) {
      return NextResponse.json(
        { error: 'Invalid guest credentials' },
        { status: 401 }
      );
    }
    userId = guest.id;
    isGuest = true;
  }

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = await callPrivateMeetRpc('replace_meet_availability', {
    p_plan_id: snapshot.plan.id,
    p_user_id: userId,
    p_is_guest: isGuest,
    p_timeblocks: parsed.data.timeblocks,
  });
  if (result.error) {
    console.error('Failed to replace Meet availability', {
      message: result.error.message,
      planId,
    });
    return NextResponse.json(
      {
        error: snapshot.plan.is_confirmed
          ? 'Plan is finalized'
          : 'Unable to save availability',
      },
      { status: snapshot.plan.is_confirmed ? 409 : 500 }
    );
  }

  const updated = await loadMeetPlanSnapshot(request, planId, actor);
  return NextResponse.json(updated, {
    headers: { 'Cache-Control': 'private, no-store' },
  });
}
