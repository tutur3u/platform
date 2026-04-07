import { NextResponse } from 'next/server';
import {
  assertValidEntryId,
  assertValidTrackerId,
  createHabitTrackerRouteContext,
  habitTrackerErrorResponse,
} from '@/lib/habit-trackers/route-utils';
import { habitTrackerEntryUpdateSchema } from '@/lib/habit-trackers/schemas';
import {
  deleteHabitTrackerEntry,
  updateHabitTrackerEntry,
} from '@/lib/habit-trackers/service';

interface RouteParams {
  wsId: string;
  trackerId: string;
  entryId: string;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<RouteParams> }
) {
  try {
    const { wsId: rawWsId, trackerId, entryId } = await params;
    assertValidTrackerId(trackerId);
    assertValidEntryId(entryId);
    const { user, sbAdmin, wsId } = await createHabitTrackerRouteContext(
      request,
      rawWsId
    );
    const body = habitTrackerEntryUpdateSchema.parse(await request.json());
    const entry = await updateHabitTrackerEntry(
      sbAdmin,
      wsId,
      trackerId,
      entryId,
      user.id,
      body
    );

    return NextResponse.json({ entry });
  } catch (error) {
    return habitTrackerErrorResponse(error);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<RouteParams> }
) {
  try {
    const { wsId: rawWsId, trackerId, entryId } = await params;
    assertValidTrackerId(trackerId);
    assertValidEntryId(entryId);
    const { user, sbAdmin, wsId } = await createHabitTrackerRouteContext(
      request,
      rawWsId
    );
    await deleteHabitTrackerEntry(sbAdmin, wsId, trackerId, entryId, user.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    return habitTrackerErrorResponse(error);
  }
}
