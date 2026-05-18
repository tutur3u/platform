import 'server-only';

import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { UserPrivateDetails } from '@tuturuuu/types';
import { notFound } from 'next/navigation';
import { listHiveAccessRequests, listHiveMembers } from '@/lib/hive/hive-db';
import type {
  HiveAccessState,
  PlatformRoleStats,
  PlatformUserWithDetails,
  SearchUserResult,
} from './types';

export async function getHiveAccessState(): Promise<HiveAccessState> {
  try {
    const [members, requests] = await Promise.all([
      listHiveMembers(),
      listHiveAccessRequests({ status: 'pending' }),
    ]);
    return {
      available: true,
      members: members.map((member) => ({
        createdAt: member.created_at,
        enabled: member.enabled,
        id: member.id,
        notes: member.notes,
        userId: member.user_id,
      })),
      requests: requests.map((request) => ({
        createdAt: request.created_at,
        email: request.email,
        id: request.id,
        note: request.note,
        requestedAt: request.requested_at,
        resolutionNote: request.resolution_note,
        resolvedAt: request.resolved_at,
        resolvedBy: request.resolved_by,
        status: request.status,
        updatedAt: request.updated_at,
        userId: request.user_id,
      })),
    };
  } catch {
    return {
      available: false,
      members: [],
      requests: [],
    };
  }
}

export function getPlatformRoleStats(
  userData: PlatformUserWithDetails[]
): PlatformRoleStats {
  return userData.reduce<PlatformRoleStats>(
    (stats, user) => {
      if (!user.enabled) {
        stats.inactive += 1;
        return stats;
      }

      stats.active += 1;

      if (user.allow_role_management) stats.admins += 1;
      if (user.allow_manage_all_challenges) stats.globalManagers += 1;
      if (user.allow_challenge_management) stats.challengeManagers += 1;
      if (user.allow_workspace_creation) stats.workspaceCreators += 1;

      if (
        !user.allow_role_management &&
        !user.allow_manage_all_challenges &&
        !user.allow_challenge_management &&
        !user.allow_workspace_creation
      ) {
        stats.members += 1;
      }

      return stats;
    },
    {
      active: 0,
      admins: 0,
      challengeManagers: 0,
      globalManagers: 0,
      inactive: 0,
      members: 0,
      workspaceCreators: 0,
    }
  );
}

function mapSearchUser(user: SearchUserResult): PlatformUserWithDetails {
  return {
    ...user,
    allow_discord_integrations: user.allow_discord_integrations ?? false,
    allow_workspace_creation: user.allow_workspace_creation ?? false,
    first_day_of_week: user.first_day_of_week ?? null,
    services: [] as UserPrivateDetails['services'],
    task_auto_assign_to_self: user.task_auto_assign_to_self ?? null,
    time_format: user.time_format ?? null,
    timezone: user.timezone ?? null,
  };
}

export async function getPlatformUserData({
  enabled,
  page = '1',
  pageSize = '10',
  q,
  role,
}: {
  enabled?: string;
  page?: string;
  pageSize?: string;
  q?: string;
  role?: string;
}): Promise<{
  userCount: number;
  userData: PlatformUserWithDetails[];
}> {
  try {
    const sbAdmin = await createAdminClient();
    if (!sbAdmin) notFound();

    if (q) {
      const { data, error } = await sbAdmin.rpc('search_users', {
        enabled_filter: enabled ? enabled === 'true' : undefined,
        page_number: Number.parseInt(page, 10),
        page_size: Number.parseInt(pageSize, 10),
        role_filter: role && role !== 'all' ? role : undefined,
        search_query: q,
      });

      if (error) return { userCount: 0, userData: [] };

      const { data: countData, error: countError } = await sbAdmin.rpc(
        'count_search_users',
        {
          enabled_filter: enabled ? enabled === 'true' : undefined,
          role_filter: role && role !== 'all' ? role : undefined,
          search_query: q,
        }
      );

      return {
        userCount: countError ? (data || []).length : countData || 0,
        userData: (data || []).map((user: SearchUserResult) =>
          mapSearchUser(user)
        ),
      };
    }

    const queryBuilder = sbAdmin
      .from('platform_user_roles')
      .select('*,...users!inner(*, ...user_private_details(*))', {
        count: 'exact',
      })
      .order('created_at', { ascending: false })
      .order('user_id');

    if (role && role !== 'all') {
      switch (role) {
        case 'admin':
          queryBuilder.eq('allow_role_management', true);
          break;
        case 'challenge_manager':
          queryBuilder.eq('allow_challenge_management', true);
          break;
        case 'global_manager':
          queryBuilder.eq('allow_manage_all_challenges', true);
          break;
        case 'workspace_creator':
          queryBuilder.eq('allow_workspace_creation', true);
          break;
        default:
          queryBuilder
            .eq('allow_challenge_management', false)
            .eq('allow_manage_all_challenges', false)
            .eq('allow_role_management', false)
            .eq('allow_workspace_creation', false);
          break;
      }
    }

    if (enabled) {
      queryBuilder.eq('enabled', enabled === 'true');
    }

    const parsedPage = Number.parseInt(page, 10);
    const parsedSize = Number.parseInt(pageSize, 10);
    const start = (parsedPage - 1) * parsedSize;
    const end = parsedPage * parsedSize - 1;
    queryBuilder.range(start, end);

    const { count, data, error } = await queryBuilder;

    if (error) return { userCount: 0, userData: [] };

    return {
      userCount: count || 0,
      userData: data || [],
    };
  } catch {
    return { userCount: 0, userData: [] };
  }
}
