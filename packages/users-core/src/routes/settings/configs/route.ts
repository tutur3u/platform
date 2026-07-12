import { DATABASE_DEFAULT_INCLUDED_GROUPS_CONFIG_ID } from '@tuturuuu/internal-api/workspace-configs';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { areContactsConfigIdsAllowed } from '@tuturuuu/users-core/lib/contacts-workspace-configs';
import { getUserGroupRoutePermissions } from '@tuturuuu/users-core/lib/user-groups/route-auth';
import { resolveUserGroupRouteWorkspaceId } from '@tuturuuu/users-core/lib/user-groups/route-helpers';
import { listWorkspaceDefaultIncludedGroupIds } from '@tuturuuu/users-core/lib/workspace-default-included-groups';
import { unstable_rethrow } from 'next/navigation';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{ wsId: string }>;
}

export async function GET(request: Request, { params }: Params) {
  try {
    const { wsId: rawWsId } = await params;
    const permissions = await getUserGroupRoutePermissions(rawWsId, request);
    if (!permissions) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const ids = [
      ...new Set(
        (new URL(request.url).searchParams.get('ids') ?? '')
          .split(',')
          .map((id) => id.trim())
          .filter(Boolean)
      ),
    ];
    if (ids.length === 0) return NextResponse.json({});
    if (!areContactsConfigIdsAllowed(ids, permissions)) {
      return NextResponse.json(
        { error: 'Insufficient permissions to read workspace settings' },
        { status: 403 }
      );
    }

    const wsId = await resolveUserGroupRouteWorkspaceId(rawWsId, request);
    const admin = await createAdminClient({ noCookie: true });
    const tableIds = ids.filter(
      (id) => id !== DATABASE_DEFAULT_INCLUDED_GROUPS_CONFIG_ID
    );
    const { data, error } = tableIds.length
      ? await admin
          .from('workspace_configs')
          .select('id, value')
          .eq('ws_id', wsId)
          .in('id', tableIds)
      : { data: [], error: null };
    if (error) throw error;

    const values = new Map<string, string | null>(
      (data ?? []).map((row) => [row.id, row.value])
    );
    if (ids.includes(DATABASE_DEFAULT_INCLUDED_GROUPS_CONFIG_ID)) {
      const included = await listWorkspaceDefaultIncludedGroupIds(admin, wsId);
      if (included.errorMessage) throw new Error(included.errorMessage);
      values.set(
        DATABASE_DEFAULT_INCLUDED_GROUPS_CONFIG_ID,
        included.data.length ? included.data.join(',') : null
      );
    }

    return NextResponse.json(
      Object.fromEntries(ids.map((id) => [id, values.get(id) ?? null]))
    );
  } catch (error) {
    unstable_rethrow(error);
    console.error('Error loading Contacts workspace configs', { error });
    return NextResponse.json(
      { error: 'Failed to fetch workspace configs' },
      { status: 500 }
    );
  }
}
