import { connection, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  readJson,
  seriesFailure,
  seriesResult,
} from '@/lib/calendar/recurrence/http';
import { MutateSeriesSchema } from '@/lib/calendar/recurrence/schema';
import { mutateSeries, readSeries } from '@/lib/calendar/recurrence/service';
import { authorizeCalendarEventManagement } from '@/lib/calendar-event-permission';

type Params = { params: Promise<{ wsId: string; seriesId: string }> };
export async function GET(request: Request, { params }: Params) {
  await connection();
  const { wsId, seriesId } = await params;
  const access = await authorizeCalendarEventManagement(request, wsId);
  if ('error' in access) return access.error;
  try {
    z.uuid().parse(seriesId);
    return NextResponse.json(
      await seriesResult(
        await readSeries(access.sbAdmin, access.wsId, seriesId, access.userId)
      )
    );
  } catch (error) {
    return seriesFailure(error);
  }
}
async function mutate(
  request: Request,
  { params }: Params,
  action: 'update' | 'delete'
) {
  const { wsId, seriesId } = await params;
  const access = await authorizeCalendarEventManagement(request, wsId);
  if ('error' in access) return access.error;
  try {
    z.uuid().parse(seriesId);
    const input = MutateSeriesSchema.parse(await readJson(request));
    const result = await mutateSeries(
      access.sbAdmin,
      access.wsId,
      seriesId,
      input,
      action,
      access.userId
    );
    return NextResponse.json(await seriesResult(result));
  } catch (error) {
    return seriesFailure(error);
  }
}
export async function PUT(request: Request, params: Params) {
  return mutate(request, params, 'update');
}
export async function DELETE(request: Request, params: Params) {
  return mutate(request, params, 'delete');
}
