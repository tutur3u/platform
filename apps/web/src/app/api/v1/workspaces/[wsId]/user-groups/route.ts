import { DATABASE_AUTO_ADD_NEW_GROUPS_TO_DEFAULT_INCLUDED_GROUPS_CONFIG_ID } from '@tuturuuu/internal-api/workspace-configs';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  MAX_MEDIUM_TEXT_LENGTH,
  MAX_NAME_LENGTH,
} from '@tuturuuu/utils/constants';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { appendWorkspaceDefaultIncludedGroupId } from '@/lib/workspace-default-included-groups';

const CreateUserGroupSchema = z
  .object({
    id: z.string().max(MAX_NAME_LENGTH).optional(),
    name: z.string().max(MAX_NAME_LENGTH).min(1),
    is_guest: z.boolean().default(false),
    starting_date: z.string().datetime().nullable().optional(),
    ending_date: z.string().datetime().nullable().optional(),
    notes: z.string().max(MAX_MEDIUM_TEXT_LENGTH).optional(),
  })
  .refine(
    (data) => {
      if (data.starting_date && data.ending_date) {
        return new Date(data.ending_date) >= new Date(data.starting_date);
      }
      return true;
    },
    {
      message: 'End date must be after or equal to start date',
      path: ['ending_date'],
    }
  );

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function GET(req: Request, { params }: Params) {
  const { wsId } = await params;

  // Check permissions
  const permissions = await getPermissions({ wsId, request: req });
  if (!permissions) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }
  const { withoutPermission } = permissions;
  if (withoutPermission('view_user_groups')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to view user groups' },
      { status: 403 }
    );
  }

  const sbAdmin = await createAdminClient();

  const { data, error } = await sbAdmin
    .from('workspace_user_groups')
    .select('*')
    .eq('ws_id', wsId);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error fetching workspace user groups' },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}

export async function POST(req: Request, { params }: Params) {
  const { wsId } = await params;

  // Check permissions
  const permissions = await getPermissions({ wsId, request: req });
  if (!permissions) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }
  const { withoutPermission } = permissions;
  if (withoutPermission('create_user_groups')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to create user groups' },
      { status: 403 }
    );
  }

  const data = CreateUserGroupSchema.safeParse(await req.json());

  if (!data.success) {
    return NextResponse.json(
      { message: 'Invalid data', errors: data.error.issues },
      { status: 400 }
    );
  }

  const sbAdmin = await createAdminClient();

  const { data: createdGroup, error } = await sbAdmin
    .from('workspace_user_groups')
    .insert({
      name: data.data.name,
      is_guest: data.data.is_guest,
      starting_date: data.data.starting_date ?? null,
      ending_date: data.data.ending_date ?? null,
      notes: data.data.notes ?? null,
      ws_id: wsId,
    })
    .select('id')
    .single();

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error creating workspace user group' },
      { status: 500 }
    );
  }

  const { data: configRows, error: configError } = await sbAdmin
    .from('workspace_configs')
    .select('id, value')
    .eq('ws_id', wsId)
    .eq(
      'id',
      DATABASE_AUTO_ADD_NEW_GROUPS_TO_DEFAULT_INCLUDED_GROUPS_CONFIG_ID
    );

  if (configError) {
    console.error(
      'Error fetching default-included-group configs:',
      configError
    );
    return NextResponse.json({ message: 'success' });
  }

  const resolvedConfigRows = configRows ?? [];

  const autoAddNewGroupsToDefaultIncludedGroups =
    resolvedConfigRows.find(
      (config) =>
        config.id ===
        DATABASE_AUTO_ADD_NEW_GROUPS_TO_DEFAULT_INCLUDED_GROUPS_CONFIG_ID
    )?.value === 'true';

  if (autoAddNewGroupsToDefaultIncludedGroups && createdGroup?.id) {
    const { errorMessage } = await appendWorkspaceDefaultIncludedGroupId(
      sbAdmin,
      wsId,
      createdGroup.id
    );

    if (errorMessage) {
      console.error(
        'Error updating default included user groups after group creation:',
        errorMessage
      );
    }
  }

  return NextResponse.json({ message: 'success' });
}
