import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import { createClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { connection, NextResponse } from 'next/server';

const CRAWLER_PERMISSION = 'ai_lab';

export async function authorizeCrawlerRead(request: Request, wsId: string) {
  await connection();

  const supabase = await createClient(request);
  const { user } = await resolveAuthenticatedSessionUser(supabase);

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const permissions = await getPermissions({ user, wsId });

  if (!permissions || permissions.withoutPermission(CRAWLER_PERMISSION)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return null;
}
