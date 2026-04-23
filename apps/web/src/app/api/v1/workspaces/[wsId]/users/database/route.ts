import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import {
  MAX_SEARCH_LENGTH,
  MAX_SHORT_TEXT_LENGTH,
} from '@tuturuuu/utils/constants';
import {
  getPermissions,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { GROUP_MEMBERSHIP_FILTER_VALUES } from '@/app/[locale]/(dashboard)/[wsId]/users/database/group-membership';
import { buildPostgrestRateLimitResponse } from '@/lib/postgrest-rate-limit';
import {
  fetchRequireAttentionUserIds,
  withRequireAttentionFlag,
} from '@/lib/require-attention-users';

function normalizeListParam(value: string | string[]) {
  const rawValues = Array.isArray(value) ? value : [value];

  return rawValues
    .flatMap((entry) => entry.split(','))
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function normalizePositiveIntegerParam(
  value: string | string[] | undefined,
  {
    fallback,
    min,
    max,
  }: {
    fallback: number;
    min: number;
    max: number;
  }
) {
  const rawValue = Array.isArray(value) ? value[0] : value;
  const parsedValue = rawValue ? Number.parseInt(rawValue, 10) : fallback;

  if (!Number.isFinite(parsedValue)) {
    return fallback;
  }

  return Math.min(Math.max(parsedValue, min), max);
}

const SearchParamsSchema = z.object({
  q: z.string().max(MAX_SEARCH_LENGTH).default(''),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_SHORT_TEXT_LENGTH)
    .default(10),
  includedGroups: z
    .union([z.string(), z.array(z.string())])
    .transform((val) => normalizeListParam(val))
    .default([]),
  excludedGroups: z
    .union([z.string(), z.array(z.string())])
    .transform((val) => normalizeListParam(val))
    .default([]),
  status: z
    .enum(['active', 'archived', 'archived_until', 'all'])
    .default('active'),
  linkStatus: z.enum(['all', 'linked', 'virtual']).default('all'),
  requireAttention: z.enum(['all', 'true', 'false']).default('all'),
  groupMembership: z.enum(GROUP_MEMBERSHIP_FILTER_VALUES).default('all'),
  withPromotions: z
    .enum(['true', 'false'])
    .catch('false')
    .transform((val) => val === 'true'),
});

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function GET(request: Request, { params }: Params) {
  try {
    const { wsId: id } = await params;
    const wsId = await normalizeWorkspaceId(id);

    // Check permissions
    const permissions = await getPermissions({ wsId, request });
    if (!permissions) {
      return Response.json({ error: 'Workspace not found' }, { status: 404 });
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

    params_obj.page = String(
      normalizePositiveIntegerParam(params_obj.page, {
        fallback: 1,
        min: 1,
        max: Number.MAX_SAFE_INTEGER,
      })
    );
    params_obj.pageSize = String(
      normalizePositiveIntegerParam(params_obj.pageSize, {
        fallback: 10,
        min: 1,
        max: MAX_SHORT_TEXT_LENGTH,
      })
    );

    const sp = SearchParamsSchema.parse(params_obj);

    // Fetch data using RPC with link_status parameter for efficient filtering
    const sbAdmin = await createAdminClient();

    let queryBuilder = sbAdmin
      .rpc(
        'get_workspace_users',
        {
          _ws_id: wsId,
          included_groups: sp.includedGroups,
          excluded_groups: sp.excludedGroups,
          search_query: sp.q,
          include_archived: sp.status !== 'active',
          link_status: sp.linkStatus,
          group_membership: sp.groupMembership,
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

    const start = (sp.page - 1) * sp.pageSize;
    const end = sp.page * sp.pageSize - 1;

    if (sp.requireAttention === 'all') {
      queryBuilder = queryBuilder.range(start, end);
    }

    const { data, error, count } = await queryBuilder;

    if (error) {
      const rateLimitResponse = buildPostgrestRateLimitResponse(error);
      if (rateLimitResponse) {
        return rateLimitResponse;
      }

      console.error('Error fetching workspace users:', error);
      return NextResponse.json(
        { message: 'Error fetching workspace users' },
        { status: 500 }
      );
    }

    const allWorkspaceUsers = (data as unknown as WorkspaceUser[]) ?? [];
    let effectiveCount = count ?? 0;
    let workspaceUsers = allWorkspaceUsers;

    if (sp.requireAttention !== 'all') {
      const requireAttentionUserIds = await fetchRequireAttentionUserIds(
        sbAdmin,
        {
          wsId,
          userIds: allWorkspaceUsers.map((user) => user.id),
        }
      );

      const shouldRequireAttention = sp.requireAttention === 'true';
      const filteredWorkspaceUsers = allWorkspaceUsers.filter((user) =>
        shouldRequireAttention
          ? requireAttentionUserIds.has(user.id)
          : !requireAttentionUserIds.has(user.id)
      );

      effectiveCount = filteredWorkspaceUsers.length;
      workspaceUsers = filteredWorkspaceUsers.slice(start, start + sp.pageSize);
    }

    const workspaceUserIds = workspaceUsers
      .map((user) => user.id)
      .filter((userId): userId is string => Boolean(userId));

    let guestUserIds = new Set<string>();
    const promotionsMap = new Map<
      string,
      {
        id: string;
        name: string | null;
        code: string | null;
        value: number | null;
        use_ratio: boolean | null;
        ws_id: string;
      }[]
    >();

    if (workspaceUserIds.length > 0) {
      const [guestResult, promotionsResult, requireAttentionUserIds] =
        await Promise.all([
          sbAdmin
            .from('workspace_user_groups_users')
            .select('user_id, workspace_user_groups!inner(is_guest, ws_id)')
            .eq('workspace_user_groups.ws_id', wsId)
            .eq('workspace_user_groups.is_guest', true)
            .in('user_id', workspaceUserIds),
          sp.withPromotions
            ? sbAdmin
                .from('user_linked_promotions')
                .select(
                  'user_id, workspace_promotions!inner(id, name, code, value, use_ratio, ws_id)'
                )
                .eq('workspace_promotions.ws_id', wsId)
                .in('user_id', workspaceUserIds)
            : Promise.resolve({ data: [], error: null }),
          fetchRequireAttentionUserIds(sbAdmin, {
            wsId,
            userIds: workspaceUserIds,
          }),
        ]);

      const guestMemberships = guestResult.data;
      const guestError = guestResult.error;

      if (guestError) {
        const rateLimitResponse = buildPostgrestRateLimitResponse(guestError);
        if (rateLimitResponse) {
          return rateLimitResponse;
        }

        console.error('Error fetching guest workspace users:', guestError);
        return NextResponse.json(
          { message: 'Error fetching workspace users' },
          { status: 500 }
        );
      }

      guestUserIds = new Set(
        (guestMemberships ?? [])
          .map((membership) => membership.user_id)
          .filter((userId): userId is string => Boolean(userId))
      );

      if (sp.withPromotions && promotionsResult.data) {
        for (const item of promotionsResult.data) {
          const promotions = promotionsMap.get(item.user_id) || [];
          promotions.push(item.workspace_promotions);
          promotionsMap.set(item.user_id, promotions);
        }
      }

      const usersWithAttention = withRequireAttentionFlag(
        workspaceUsers,
        requireAttentionUserIds
      );
      workspaceUsers.splice(0, workspaceUsers.length, ...usersWithAttention);
    }

    const withDetails = workspaceUsers.map((u) => {
      // Sanitize data based on permissions
      const sanitized: Record<string, unknown> = {
        ...u,
        is_guest: guestUserIds.has(u.id),
      };

      if (sp.withPromotions) {
        const promos = promotionsMap.get(u.id) || [];
        sanitized.linked_promotions = promos;
        sanitized.linked_promotions_count = promos.length;
        sanitized.linked_promotion_names = promos
          .map((p) => p.name)
          .filter(Boolean)
          .join(', ');
        sanitized.linked_promotion_codes = promos
          .map((p) => p.code)
          .filter(Boolean)
          .join(', ');
        sanitized.linked_promotion_values = promos
          .map((p) => (p.use_ratio ? `${p.value}%` : p.value))
          .filter((v) => v !== null && v !== undefined)
          .join(', ');
      }

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
    });

    return NextResponse.json({
      data: withDetails,
      count: effectiveCount,
      permissions: {
        hasPrivateInfo,
        hasPublicInfo,
        canCheckUserAttendance,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { message: 'Invalid query parameters', issues: error.issues },
        { status: 400 }
      );
    }

    console.error('Error in workspace users API:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}
