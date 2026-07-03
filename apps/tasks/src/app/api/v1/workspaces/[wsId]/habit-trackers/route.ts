import { NextResponse } from 'next/server';
import {
  createHabitTrackerRouteContext,
  habitTrackerErrorResponse,
} from '@/lib/habit-trackers/route-utils';
import {
  habitTrackerInputSchema,
  habitTrackerListQuerySchema,
} from '@/lib/habit-trackers/schemas';
import {
  createHabitTracker,
  listHabitTrackerCards,
} from '@/lib/habit-trackers/service';

interface RouteParams {
  wsId: string;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<RouteParams> }
) {
  try {
    const { wsId: rawWsId } = await params;
    const { user, sbAdmin, wsId } = await createHabitTrackerRouteContext(
      request,
      rawWsId
    );
    const url = new URL(request.url);
    const query = habitTrackerListQuerySchema.parse({
      scope: url.searchParams.get('scope') ?? undefined,
      userId: url.searchParams.get('userId') ?? undefined,
    });
    const scope = query.scope ?? 'self';
    const response = await listHabitTrackerCards(
      sbAdmin,
      wsId,
      user.id,
      scope,
      query.userId
    );

    return NextResponse.json(response);
  } catch (error) {
    return habitTrackerErrorResponse(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<RouteParams> }
) {
  try {
    const { wsId: rawWsId } = await params;
    const { user, sbAdmin, wsId } = await createHabitTrackerRouteContext(
      request,
      rawWsId
    );
    const body = habitTrackerInputSchema.parse(await request.json());
    const tracker = await createHabitTracker(sbAdmin, wsId, user.id, body);

    return NextResponse.json({ tracker }, { status: 201 });
  } catch (error) {
    return habitTrackerErrorResponse(error);
  }
}
