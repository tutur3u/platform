import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import {
  collectSearchParams,
  handleUsersDatabaseRequest,
  type Params,
  readJsonObject,
} from '@tuturuuu/users-core/routes/users/database';
import { createLegacyHeadHandler } from '@/lib/legacy-head';

// Contacts serves the workspace-users database endpoint natively. Request
// log-draining stays an apps/web concern, so this satellite invokes the shared
// handler directly; responses (status, body, headers) match the web route.
export async function GET(request: Request, context: Params) {
  const user = await getSatelliteAppSessionUser('contacts');
  if (!user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  return handleUsersDatabaseRequest(
    request,
    context,
    collectSearchParams(searchParams),
    user
  );
}

export async function POST(request: Request, context: Params) {
  const user = await getSatelliteAppSessionUser('contacts');
  if (!user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return handleUsersDatabaseRequest(
    request,
    context,
    await readJsonObject(request),
    user
  );
}

export const HEAD = createLegacyHeadHandler(GET);
