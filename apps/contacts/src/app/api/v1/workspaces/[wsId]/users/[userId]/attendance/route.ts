import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import {
  handleGetUserAttendanceRequest,
  type UserAttendanceParams,
} from '@tuturuuu/users-core/routes/users/attendance';
import { connection, NextResponse } from 'next/server';

export async function GET(request: Request, context: UserAttendanceParams) {
  await connection();
  const actor = await getSatelliteAppSessionUser('contacts');
  if (!actor?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return handleGetUserAttendanceRequest(request, context, actor);
}
