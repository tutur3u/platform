import { connection, NextResponse } from 'next/server';
import { z } from 'zod';
import { providerOperationFailure } from '@/lib/calendar/recurrence/provider/http';
import {
  executeRequestProviderOperation,
  publicProviderOperation,
  readProviderOperation,
} from '@/lib/calendar/recurrence/provider/request-service';
import { authorizeCalendarEventManagement } from '@/lib/calendar-event-permission';

type Params = { params: Promise<{ wsId: string; operationId: string }> };
export async function GET(request: Request, { params }: Params) {
  await connection();
  const { wsId, operationId } = await params;
  const access = await authorizeCalendarEventManagement(request, wsId);
  if ('error' in access) return access.error;
  try {
    return NextResponse.json(
      await publicProviderOperation(
        await readProviderOperation(access, z.uuid().parse(operationId))
      )
    );
  } catch (error) {
    return providerOperationFailure(error);
  }
}
export async function POST(request: Request, { params }: Params) {
  await connection();
  const { wsId, operationId } = await params;
  const access = await authorizeCalendarEventManagement(request, wsId);
  if ('error' in access) return access.error;
  try {
    const result = await executeRequestProviderOperation(
      access,
      z.uuid().parse(operationId)
    );
    return NextResponse.json(result, {
      status: result.status === 'applied' ? 200 : 202,
    });
  } catch (error) {
    return providerOperationFailure(error);
  }
}
