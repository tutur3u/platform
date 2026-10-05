import { connection, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  readJson,
  seriesFailure,
  seriesResult,
} from '@/lib/calendar/recurrence/http';
import {
  CreateSeriesSchema,
  StoredSeriesSchema,
} from '@/lib/calendar/recurrence/schema';
import {
  callSeries,
  createSeries,
  expandSeriesList,
} from '@/lib/calendar/recurrence/service';
import { authorizeCalendarEventManagement } from '@/lib/calendar-event-permission';

type Params = { params: Promise<{ wsId: string }> };
export async function GET(request: Request, { params }: Params) {
  await connection();
  const access = await authorizeCalendarEventManagement(
    request,
    (await params).wsId
  );
  if ('error' in access) return access.error;
  try {
    const raw = await callSeries(
      access.sbAdmin,
      access.wsId,
      'read',
      {},
      access.userId
    );
    const url = new URL(request.url);
    if (!url.searchParams.has('from') && !url.searchParams.has('to')) {
      const rows = z.array(StoredSeriesSchema).parse(raw);
      return NextResponse.json({
        series: await Promise.all(rows.map(seriesResult)),
      });
    }
    const range = z
      .object({
        from: z.iso.datetime({ offset: true }),
        to: z.iso.datetime({ offset: true }),
        limit: z.coerce.number().int().min(1).max(1000).default(1000),
      })
      .parse({
        from: url.searchParams.get('from'),
        to: url.searchParams.get('to'),
        limit: url.searchParams.get('limit') ?? undefined,
      });
    const days = (Date.parse(range.to) - Date.parse(range.from)) / 86400000;
    if (days <= 0 || days > 400)
      throw new RangeError('Range must be within 400 days');
    return NextResponse.json({ data: await expandSeriesList(raw, range) });
  } catch (error) {
    return seriesFailure(error);
  }
}
export async function POST(request: Request, { params }: Params) {
  const access = await authorizeCalendarEventManagement(
    request,
    (await params).wsId
  );
  if ('error' in access) return access.error;
  try {
    const input = CreateSeriesSchema.parse(await readJson(request));
    const result = await createSeries(
      access.sbAdmin,
      access.wsId,
      input,
      access.userId
    );
    return NextResponse.json(await seriesResult(result), { status: 201 });
  } catch (error) {
    return seriesFailure(error);
  }
}
