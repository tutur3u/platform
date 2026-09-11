import {
  GET as getHandler,
  POST,
} from '@tuturuuu/users-core/routes/users/reports/route';
import { connection } from 'next/server';

export { POST };
export async function GET(
  request: Request,
  context: { params: Promise<{ wsId: string }> }
) {
  await connection();
  return getHandler(request, context);
}
