import type { HabitTrackerEntryInput } from '@tuturuuu/types/primitives/HabitTracker';
import { NextResponse } from 'next/server';
import {
  assertValidTrackerId,
  createHabitTrackerRouteContext,
  habitTrackerErrorResponse,
} from '@/lib/habit-trackers/route-utils';
import { habitTrackerEntryInputSchema } from '@/lib/habit-trackers/schemas';
import { getHabitTrackerDetail } from '@/lib/habit-trackers/service';
import { createHabitTrackerEntry } from '@/lib/habit-trackers/writes';

interface RouteParams {
  wsId: string;
  trackerId: string;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<RouteParams> }
) {
  try {
    const { wsId: rawWsId, trackerId } = await params;
    assertValidTrackerId(trackerId);
    const { user, sbAdmin, wsId } = await createHabitTrackerRouteContext(
      request,
      rawWsId
    );
    const detail = await getHabitTrackerDetail(
      sbAdmin,
      wsId,
      trackerId,
      user.id,
      'self'
    );

    return NextResponse.json({ entries: detail.entries });
  } catch (error) {
    return habitTrackerErrorResponse(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<RouteParams> }
) {
  try {
    const { wsId: rawWsId, trackerId } = await params;
    assertValidTrackerId(trackerId);
    const { user, sbAdmin, wsId } = await createHabitTrackerRouteContext(
      request,
      rawWsId
    );
    const body = habitTrackerEntryInputSchema.parse(
      await request.json()
    ) as HabitTrackerEntryInput;
    const { entry, replayed } = await createHabitTrackerEntry(
      sbAdmin,
      wsId,
      trackerId,
      user.id,
      body
    );

    return NextResponse.json(
      { entry, replayed },
      { status: replayed ? 200 : 201 }
    );
  } catch (error) {
    return habitTrackerErrorResponse(error);
  }
}
