import { connection, NextResponse } from 'next/server';
import { readJson } from '@/lib/calendar/recurrence/http';
import { providerSeriesCapabilities } from '@/lib/calendar/recurrence/provider/capabilities';
import { providerOperationFailure } from '@/lib/calendar/recurrence/provider/http';
import {
  executeRequestProviderOperation,
  reserveProviderOperation,
} from '@/lib/calendar/recurrence/provider/request-service';
import { authorizeCalendarEventManagement } from '@/lib/calendar-event-permission';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ wsId: string }> }
) {
  await connection();
  const access = await authorizeCalendarEventManagement(
    request,
    (await params).wsId
  );
  if ('error' in access) return access.error;
  if (process.env.CALENDAR_PROVIDER_SERIES_OPERATIONS_ENABLED !== 'true') {
    return NextResponse.json(
      {
        error: 'Provider recurrence admission is not enabled',
        code: 'PROVIDER_SERIES_DISABLED',
      },
      { status: 503 }
    );
  }
  try {
    const operation = await reserveProviderOperation(
      access,
      await readJson(request)
    );
    const result = await executeRequestProviderOperation(access, operation.id);
    return NextResponse.json(result, {
      status: result.status === 'applied' ? 200 : 202,
    });
  } catch (error) {
    return providerOperationFailure(error);
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ wsId: string }> }
) {
  await connection();
  const access = await authorizeCalendarEventManagement(
    request,
    (await params).wsId
  );
  if ('error' in access) return access.error;
  try {
    return NextResponse.json(await providerSeriesCapabilities(access), {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    return providerOperationFailure(error);
  }
}
