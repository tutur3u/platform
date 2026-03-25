import { NextResponse } from 'next/server';
import {
  assertValidTrackerId,
  createHabitTrackerRouteContext,
  habitTrackerErrorResponse,
} from '@/lib/habit-trackers/route-utils';
import { habitTrackerStreakActionInputSchema } from '@/lib/habit-trackers/schemas';
import { applyHabitTrackerStreakAction } from '@/lib/habit-trackers/service';

interface RouteParams {
  wsId: string;
  trackerId: string;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<RouteParams> }
) {
  try {
    const { wsId, trackerId } = await params;
    assertValidTrackerId(trackerId);
    const { user, sbAdmin } = await createHabitTrackerRouteContext(
      request,
      wsId
    );
    const body = habitTrackerStreakActionInputSchema.parse(
      await request.json()
    );
    const action = await applyHabitTrackerStreakAction(
      sbAdmin,
      wsId,
      trackerId,
      user.id,
      body
    );

    return NextResponse.json({ action }, { status: 201 });
  } catch (error) {
    return habitTrackerErrorResponse(error);
  }
}
