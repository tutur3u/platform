import { createClient } from '@tuturuuu/supabase/next/server';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { getPermissions, getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const SearchParamsSchema = z.object({
  q: z.string().default(''),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  includedGroups: z
    .union([z.string(), z.array(z.string())])
    .transform((val) => (Array.isArray(val) ? val : val ? [val] : []))
    .default([]),
  excludedGroups: z
    .union([z.string(), z.array(z.string())])
    .transform((val) => (Array.isArray(val) ? val : val ? [val] : []))
    .default([]),
  status: z
    .enum(['active', 'archived', 'archived_until', 'all'])
    .default('active'),
  linkStatus: z.enum(['all', 'linked', 'virtual']).default('all'),
});

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function GET(request: Request, { params }: Params) {
  try {
    const supabase = await createClient();
    const { wsId: id } = await params;

    // Resolve workspace ID
    const workspace = await getWorkspace(id);
if (!workspace) {
  return Response.json({ error: 'Workspace not found' }, { status: 404 });
}
    const wsId = workspace.id;

    // Check permissions
    const permissions = await getPermissions({ wsId });
if (!permissions) {
  return Response.json({ error: 'Not found' }, { status: 404 });
}
const { containsPermission } = permissions;
    const hasPrivateInfo = containsPermission('view_users_private_info');
    const hasPublicInfo = containsPermission('view_users_public_info');
    const canCheckUserAttendance = containsPermission('check_user_attendance');

    // User must have at least one permission to view users
    if (!hasPrivateInfo && !hasPublicInfo) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
    }

    // Parse query params
    const { searchParams } = new URL(request.url);
    const params_obj: Record<string, string | string[]> = {};

    searchParams.forEach((value, key) => {
      const existing = params_obj[key];
      if (existing) {
        if (Array.isArray(existing)) {
          existing.push(value);
        } else {
          params_obj[key] = [existing, value];
        }
      } else {
        params_obj[key] = value;
      }
    });

    const sp = SearchParamsSchema.parse(params_obj);

    // Fetch data using RPC with link_status parameter for efficient filtering
    let queryBuilder = supabase
      .rpc(
        'get_workspace_users',
        {
          _ws_id: wsId,
          included_groups: sp.includedGroups,
          excluded_groups: sp.excludedGroups,
          search_query: sp.q,
          include_archived: sp.status !== 'active',
          link_status: sp.linkStatus,
        },
        {
          count: 'exact',
        }
      )
      .select('*')
      .order('full_name', { ascending: true, nullsFirst: false });

    // Apply status filters (archived vs archived_until distinction)
    if (sp.status === 'archived') {
      queryBuilder = queryBuilder
        .eq('archived', true)
        .is('archived_until', null);
    } else if (sp.status === 'archived_until') {
      queryBuilder = queryBuilder.gt(
        'archived_until',
        new Date().toISOString()
      );
    }

    // Apply pagination
    const start = (sp.page - 1) * sp.pageSize;
    const end = sp.page * sp.pageSize - 1;
    queryBuilder = queryBuilder.range(start, end);

    const { data, error, count } = await queryBuilder;

    if (error) {
      console.error('Error fetching workspace users:', error);
      return NextResponse.json(
        { message: 'Error fetching workspace users' },
        { status: 500 }
      );
    }

    // Enrich each user with guest status
    const withGuest = await Promise.all(
      (data as unknown as WorkspaceUser[]).map(async (u) => {
        const { data: isGuest } = await supabase.rpc('is_user_guest', {
          user_uuid: u.id,
        });

        // Sanitize data based on permissions
        const sanitized: Record<string, unknown> = {
          ...u,
          is_guest: Boolean(isGuest),
        };

        // Remove private fields if user doesn't have permission
        if (!hasPrivateInfo) {
          delete sanitized.email;
          delete sanitized.phone;
          delete sanitized.birthday;
          delete sanitized.gender;
          delete sanitized.ethnicity;
          delete sanitized.guardian;
          delete sanitized.national_id;
          delete sanitized.address;
          delete sanitized.note;
        }

        // Remove public fields if user doesn't have permission
        if (!hasPublicInfo) {
          delete sanitized.avatar_url;
          delete sanitized.full_name;
          delete sanitized.display_name;
          delete sanitized.group_count;
          delete sanitized.linked_users;
          delete sanitized.created_at;
          delete sanitized.updated_at;
        }

        if (!canCheckUserAttendance) {
          delete sanitized.attendance_count;
        }

        return sanitized as unknown as WorkspaceUser & { is_guest?: boolean };
      })
    );

    return NextResponse.json({
      data: withGuest,
      count: count ?? 0,
      permissions: {
        hasPrivateInfo,
        hasPublicInfo,
        canCheckUserAttendance,
      },
    });
  } catch (error) {
    console.error('Error in workspace users API:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}
