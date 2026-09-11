import {
  GET as getHandler,
  PUT,
} from '@tuturuuu/users-core/routes/users/reports/schedules/route';
import { connection } from 'next/server';

export { PUT };
export async function GET(
  request: Request,
  context: { params: Promise<{ wsId: string }> }
) {
  await connection();
  return getHandler(request, context);
}
