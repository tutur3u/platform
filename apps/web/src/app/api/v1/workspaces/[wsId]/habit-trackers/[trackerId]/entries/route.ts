import { NextResponse } from 'next/server';
import {
  assertValidTrackerId,
  createHabitTrackerRouteContext,
  habitTrackerErrorResponse,
} from '@/lib/habit-trackers/route-utils';
import { habitTrackerEntryInputSchema } from '@/lib/habit-trackers/schemas';
import {
  createHabitTrackerEntry,
  getHabitTrackerDetail,
} from '@/lib/habit-trackers/service';

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
    const body = habitTrackerEntryInputSchema.parse(await request.json());
    const entry = await createHabitTrackerEntry(
      sbAdmin,
      wsId,
      trackerId,
      user.id,
      body
    );

    return NextResponse.json({ entry }, { status: 201 });
  } catch (error) {
    return habitTrackerErrorResponse(error);
  }
}
