import {
  collectSearchParams,
  handleUsersDatabaseRequest,
  type Params,
  readJsonObject,
  USERS_DATABASE_ROUTE,
} from '@tuturuuu/users-core/routes/users/database';
import { withRequestLogDrain } from '@/lib/infrastructure/log-drain';

export async function GET(request: Request, context: Params) {
  const { searchParams } = new URL(request.url);
  return withRequestLogDrain(
    {
      request,
      route: USERS_DATABASE_ROUTE,
    },
    () =>
      handleUsersDatabaseRequest(
        request,
        context,
        collectSearchParams(searchParams)
      )
  );
}

export async function POST(request: Request, context: Params) {
  return withRequestLogDrain(
    {
      request,
      route: USERS_DATABASE_ROUTE,
    },
    async () =>
      handleUsersDatabaseRequest(
        request,
        context,
        await readJsonObject(request)
      )
  );
}
