import { DATABASE_DEFAULT_INCLUDED_GROUPS_CONFIG_ID } from '@tuturuuu/internal-api/workspace-configs';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  areContactsConfigIdsAllowed,
  CONTACTS_USER_MANAGEMENT_CONFIG_IDS,
} from '@tuturuuu/users-core/lib/contacts-workspace-configs';
import { getUserGroupRoutePermissions } from '@tuturuuu/users-core/lib/user-groups/route-auth';
import { resolveUserGroupRouteWorkspaceId } from '@tuturuuu/users-core/lib/user-groups/route-helpers';
import {
  listWorkspaceDefaultIncludedGroupIds,
  replaceWorkspaceDefaultIncludedGroupIds,
} from '@tuturuuu/users-core/lib/workspace-default-included-groups';
import { unstable_rethrow } from 'next/navigation';
import { NextResponse } from 'next/server';
import { z } from 'zod';

interface Params {
  params: Promise<{ configId: string; wsId: string }>;
}

async function getAccess(request: Request, rawWsId: string, configId: string) {
  const permissions = await getUserGroupRoutePermissions(rawWsId, request);
  if (!permissions) {
    return {
      response: NextResponse.json({ error: 'Not found' }, { status: 404 }),
    } as const;
  }
  if (!areContactsConfigIdsAllowed([configId], permissions)) {
    return {
      response: NextResponse.json(
        { error: 'Insufficient permissions to access workspace setting' },
        { status: 403 }
      ),
    } as const;
  }
  return {
    admin: await createAdminClient({ noCookie: true }),
    permissions,
    wsId: await resolveUserGroupRouteWorkspaceId(rawWsId, request),
  } as const;
}

export async function GET(request: Request, { params }: Params) {
  try {
    const { configId, wsId: rawWsId } = await params;
    const access = await getAccess(request, rawWsId, configId);
    if ('response' in access) return access.response;

    if (configId === DATABASE_DEFAULT_INCLUDED_GROUPS_CONFIG_ID) {
      const result = await listWorkspaceDefaultIncludedGroupIds(
        access.admin,
        access.wsId
      );
      if (result.errorMessage) throw new Error(result.errorMessage);
      return NextResponse.json({
        value: result.data.length ? result.data.join(',') : null,
      });
    }

    const { data, error } = await access.admin
      .from('workspace_configs')
      .select('value')
      .eq('ws_id', access.wsId)
      .eq('id', configId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({}, { status: 404 });
    return NextResponse.json({ value: data.value });
  } catch (error) {
    unstable_rethrow(error);
    console.error('Error loading Contacts workspace config', { error });
    return NextResponse.json(
      { error: 'Failed to fetch workspace config' },
      { status: 500 }
    );
  }
}

const updateSchema = z.object({ value: z.string() });

export async function PUT(request: Request, { params }: Params) {
  try {
    const { configId, wsId: rawWsId } = await params;
    const access = await getAccess(request, rawWsId, configId);
    if ('response' in access) return access.response;
    if (
      access.permissions.withoutPermission('manage_workspace_settings') &&
      !(
        CONTACTS_USER_MANAGEMENT_CONFIG_IDS.has(configId) &&
        access.permissions.containsPermission('update_users')
      )
    ) {
      return NextResponse.json(
        { error: 'Insufficient permissions to update workspace setting' },
        { status: 403 }
      );
    }

    const parsed = updateSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parsed.error.issues },
        { status: 400 }
      );
    }

    if (configId === DATABASE_DEFAULT_INCLUDED_GROUPS_CONFIG_ID) {
      const result = await replaceWorkspaceDefaultIncludedGroupIds(
        access.admin,
        access.wsId,
        parsed.data.value
      );
      if (result.errorMessage) throw new Error(result.errorMessage);
      return NextResponse.json({ message: 'success' });
    }

    const { error } = await access.admin.from('workspace_configs').upsert(
      {
        id: configId,
        updated_at: new Date().toISOString(),
        value: parsed.data.value,
        ws_id: access.wsId,
      },
      { onConflict: 'id,ws_id' }
    );
    if (error) throw error;
    return NextResponse.json({ message: 'success' });
  } catch (error) {
    unstable_rethrow(error);
    console.error('Error updating Contacts workspace config', { error });
    return NextResponse.json(
      { error: 'Failed to update workspace config' },
      { status: 500 }
    );
  }
}
