import { deletePlan, updatePlan } from '@tuturuuu/apis/meet/actions';
import { connection, type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { loadMeetPlanSnapshot } from './_lib/snapshot';

interface RouteContext {
  params: Promise<{ planId: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  await connection();
  const { planId } = await context.params;

  try {
    const snapshot = await loadMeetPlanSnapshot(request, planId);
    if (!snapshot) {
      return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
    }
    return NextResponse.json(snapshot, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    console.error('Failed to load Tuturuuu Meet plan', { error, planId });
    return NextResponse.json(
      { error: 'Unable to load this plan' },
      { status: 500 }
    );
  }
}

const updatePlanSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  dates: z.array(z.string().date()).min(1).optional(),
  start_time: z.string().min(4).max(32).optional(),
  end_time: z.string().min(4).max(32).optional(),
  timezone: z.string().min(1).max(255).optional(),
  duration_minutes: z
    .number()
    .int()
    .min(15)
    .max(1440)
    .multipleOf(15)
    .optional(),
  where_to_meet: z.boolean().optional(),
  description: z.string().max(5000).optional(),
  agenda_content: z.unknown().optional(),
});

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { planId } = await context.params;
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Malformed JSON' }, { status: 400 });
  }
  const parsed = updatePlanSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
  }
  const result = await updatePlan(planId, parsed.data);
  if (!result.data) {
    return NextResponse.json(
      { error: result.error ?? 'Unable to update plan' },
      { status: result.error === 'Not authenticated' ? 401 : 400 }
    );
  }
  const snapshot = await loadMeetPlanSnapshot(request, planId);
  return NextResponse.json(snapshot);
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const { planId } = await context.params;
  const result = await deletePlan(planId);
  if (!result.data) {
    return NextResponse.json(
      { error: result.error ?? 'Unable to delete plan' },
      { status: result.error === 'Not authenticated' ? 401 : 400 }
    );
  }
  return new NextResponse(null, { status: 204 });
}
