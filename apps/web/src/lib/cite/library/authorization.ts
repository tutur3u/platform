import 'server-only';

import {
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
  getPermissions,
} from '@tuturuuu/utils/workspace-helper';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { SessionAuthContext } from '@/lib/api-auth';
import type { CitationLibraryScope } from './contracts';

type ScopeResult =
  | { ok: true; scope: CitationLibraryScope }
  | { ok: false; response: NextResponse };

export async function authorizeCitationLibrary(
  request: NextRequest,
  auth: SessionAuthContext,
  workspace: string
): Promise<ScopeResult> {
  const wsId = await normalizeWorkspaceId(workspace, auth.supabase, request);
  if (!z.uuid().safeParse(wsId).success)
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'INVALID_WORKSPACE' },
        { status: 400 }
      ),
    };
  const membership = await verifyWorkspaceMembershipType({
    wsId,
    userId: auth.user.id,
    supabase: auth.supabase,
  });
  if (membership.error === 'membership_lookup_failed')
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'ACCESS_UNAVAILABLE' },
        { status: 503 }
      ),
    };
  if (!membership.ok)
    return {
      ok: false,
      response: NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 }),
    };
  const permissions = await getPermissions({ wsId, user: auth.user, request });
  if (!permissions)
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'ACCESS_UNAVAILABLE' },
        { status: 503 }
      ),
    };
  if (permissions.withoutPermission('manage_documents'))
    return {
      ok: false,
      response: NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 }),
    };
  return { ok: true, scope: { wsId, actorId: auth.user.id } };
}
