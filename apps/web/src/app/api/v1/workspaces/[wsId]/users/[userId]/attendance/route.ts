import {
  handleGetUserAttendanceRequest,
  type UserAttendanceParams,
} from '@tuturuuu/users-core/routes/users/attendance';
import { connection } from 'next/server';

export async function GET(request: Request, context: UserAttendanceParams) {
  await connection();
  return handleGetUserAttendanceRequest(request, context);
}
