import { NextResponse } from 'next/server';
import {
  assertValidTrackerId,
  createHabitTrackerRouteContext,
  habitTrackerErrorResponse,
} from '@/lib/habit-trackers/route-utils';
import {
  habitTrackerListQuerySchema,
  habitTrackerUpdateSchema,
} from '@/lib/habit-trackers/schemas';
import {
  archiveHabitTracker,
  getHabitTrackerDetail,
  updateHabitTracker,
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
    const url = new URL(request.url);
    const query = habitTrackerListQuerySchema.parse({
      scope: url.searchParams.get('scope') ?? undefined,
      userId: url.searchParams.get('userId') ?? undefined,
    });
    const detail = await getHabitTrackerDetail(
      sbAdmin,
      wsId,
      trackerId,
      user.id,
      query.scope ?? 'self',
      query.userId
    );

    return NextResponse.json(detail);
  } catch (error) {
    return habitTrackerErrorResponse(error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<RouteParams> }
) {
  try {
    const { wsId: rawWsId, trackerId } = await params;
    assertValidTrackerId(trackerId);
    const { sbAdmin, wsId } = await createHabitTrackerRouteContext(
      request,
      rawWsId
    );
    const body = habitTrackerUpdateSchema.parse(await request.json());
    const tracker = await updateHabitTracker(sbAdmin, wsId, trackerId, body);

    return NextResponse.json({ tracker });
  } catch (error) {
    return habitTrackerErrorResponse(error);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<RouteParams> }
) {
  try {
    const { wsId: rawWsId, trackerId } = await params;
    assertValidTrackerId(trackerId);
    const { sbAdmin, wsId } = await createHabitTrackerRouteContext(
      request,
      rawWsId
    );
    await archiveHabitTracker(sbAdmin, wsId, trackerId);

    return NextResponse.json({ success: true });
  } catch (error) {
    return habitTrackerErrorResponse(error);
  }
}
