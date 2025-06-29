import { createClient } from '@tuturuuu/supabase/next/server';
import type {
  PlatformUser,
  User,
  UserPrivateDetails,
} from '@tuturuuu/types/db';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import {
  Building,
  Crown,
  Globe,
  Shield,
  UserCheck,
  Users,
} from '@tuturuuu/ui/icons';
import { Separator } from '@tuturuuu/ui/separator';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { notFound, redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { CustomDataTable } from '@/components/custom-data-table';
import { getPlatformRoleColumns } from './columns';

// Define a type that matches what the search_users RPC function actually returns
type SearchUserResult = {
  created_at: string;
  id: string;
  display_name: string;
  deleted: boolean;
  avatar_url: string;
  handle: string;
  bio: string;
  user_id: string;
  enabled: boolean;
  allow_challenge_management: boolean;
  allow_manage_all_challenges: boolean;
  allow_role_management: boolean;
  allow_workspace_creation?: boolean;
  email: string;
  new_email: string;
  birthday: string;
  team_name: string[];
};

// Create a compatible type that merges the search result with required User fields
type PlatformUserWithDetails = Omit<User, 'services'> &
  Omit<PlatformUser, 'allow_workspace_creation'> &
  Partial<UserPrivateDetails> & {
    services?: User['services']; // Make services optional since RPC doesn't return it
    allow_workspace_creation?: boolean; // Make this optional to handle RPC function compatibility
  };

interface Props {
  params: Promise<{
    wsId: string;
  }>;
  searchParams: Promise<{
    q?: string;
    page?: string;
    pageSize?: string;
    role?: string;
    enabled?: string;
  }>;
}

export default async function PlatformRolesPage({
  params,
  searchParams,
}: Props) {
  const locale = await getLocale();
  const t = await getTranslations();
  const { wsId } = await params;

  // Only allow root workspace members to access this page
  if (wsId !== ROOT_WORKSPACE_ID) {
    redirect(`/${wsId}/settings`);
  }

  const { withoutPermission } = await getPermissions({
    wsId,
  });

  if (withoutPermission('manage_workspace_roles'))
    redirect(`/${wsId}/settings`);

  const { q, page, pageSize, role, enabled } = await searchParams;

  // Fetch platform user data
  const { userData, userCount } = await getPlatformUserData({
    q,
    page: page || '1',
    pageSize: pageSize || '10',
    role,
    enabled,
  });

  // Calculate role statistics
  const roleStats = userData.reduce(
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

      // Count users with only basic member permissions
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
      inactive: 0,
      admins: 0,
      globalManagers: 0,
      challengeManagers: 0,
      workspaceCreators: 0,
      members: 0,
    }
  );

  return (
    <>
      <FeatureSummary
        pluralTitle={t('platform-roles.plural')}
        description={t('platform-roles.description')}
      />

      {/* Role Statistics */}
      <div className="my-6 grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-7">
        <div className="rounded-lg border bg-card p-3 shadow-sm">
          <div className="flex items-center gap-2">
            <UserCheck className="h-4 w-4 text-dynamic-green" />
            <div className="text-2xl font-bold text-dynamic-green">
              {roleStats.active}
            </div>
          </div>
          <p className="text-xs text-dynamic-muted-foreground">Active Users</p>
        </div>

        <div className="rounded-lg border bg-card p-3 shadow-sm">
          <div className="flex items-center gap-2">
            <Crown className="h-4 w-4 text-dynamic-red" />
            <div className="text-2xl font-bold text-dynamic-red">
              {roleStats.admins}
            </div>
          </div>
          <p className="text-xs text-dynamic-muted-foreground">Admins</p>
        </div>

        <div className="rounded-lg border bg-card p-3 shadow-sm">
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-dynamic-blue" />
            <div className="text-2xl font-bold text-dynamic-blue">
              {roleStats.globalManagers}
            </div>
          </div>
          <p className="text-xs text-dynamic-muted-foreground">
            Global Managers
          </p>
        </div>

        <div className="rounded-lg border bg-card p-3 shadow-sm">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-dynamic-purple" />
            <div className="text-2xl font-bold text-dynamic-purple">
              {roleStats.challengeManagers}
            </div>
          </div>
          <p className="text-xs text-dynamic-muted-foreground">
            Challenge Managers
          </p>
        </div>

        <div className="rounded-lg border bg-card p-3 shadow-sm">
          <div className="flex items-center gap-2">
            <Building className="h-4 w-4 text-dynamic-green" />
            <div className="text-2xl font-bold text-dynamic-green">
              {roleStats.workspaceCreators}
            </div>
          </div>
          <p className="text-xs text-dynamic-muted-foreground">
            Workspace Creators
          </p>
        </div>

        <div className="rounded-lg border bg-card p-3 shadow-sm">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-dynamic-muted-foreground" />
            <div className="text-2xl font-bold">{roleStats.members}</div>
          </div>
          <p className="text-xs text-dynamic-muted-foreground">Members</p>
        </div>

        <div className="rounded-lg border bg-card p-3 shadow-sm">
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 bg-dynamic-muted rounded-full" />
            <div className="text-2xl font-bold text-dynamic-muted-foreground">
              {roleStats.inactive}
            </div>
          </div>
          <p className="text-xs text-dynamic-muted-foreground">Inactive</p>
        </div>
      </div>

      <Separator className="my-4" />
      <CustomDataTable
        data={userData}
        columnGenerator={getPlatformRoleColumns as any}
        count={userCount}
        extraData={{ locale }}
        namespace="platform-role-data-table"
        defaultVisibility={{
          id: false,
          created_at: false,
          // Show permissions overview by default, hide individual toggles initially
          platform_role: true,
          enabled: true,
          display_name: true,
          // Hide individual permission columns by default to prevent overwhelming UI
          allow_role_management: false,
          allow_manage_all_challenges: false,
          allow_challenge_management: false,
          allow_workspace_creation: false,
        }}
      />
    </>
  );
}

async function getPlatformUserData({
  q,
  page = '1',
  pageSize = '10',
  role,
  enabled,
}: {
  q?: string;
  page?: string;
  pageSize?: string;
  role?: string;
  enabled?: string;
}): Promise<{
  userData: PlatformUserWithDetails[];
  userCount: number;
}> {
  try {
    const supabase = await createClient();
    if (!supabase) notFound();

    // If there's a search query, use the RPC function
    if (q) {
      const { data, error } = await supabase.rpc('search_users', {
        search_query: q,
        page_number: parseInt(page),
        page_size: parseInt(pageSize),
        role_filter: role && role !== 'all' ? role : undefined,
        enabled_filter: enabled ? enabled === 'true' : undefined,
      });

      if (error) {
        console.error('Error searching users:', error);
        return { userData: [], userCount: 0 };
      }

      // Get count for pagination
      const { data: countData, error: countError } = await supabase.rpc(
        'count_search_users',
        {
          search_query: q,
          role_filter: role && role !== 'all' ? role : undefined,
          enabled_filter: enabled ? enabled === 'true' : undefined,
        }
      );

      if (countError) {
        console.error('Error getting count:', countError);
        return {
          userData: (data || []).map((user: SearchUserResult) => ({
            ...user,
            services: [] as User['services'], // Provide default empty services array
            allow_workspace_creation: user.allow_workspace_creation ?? false, // Provide default value
          })),
          userCount: (data || []).length,
        };
      }

      return {
        userData: (data || []).map((user: SearchUserResult) => ({
          ...user,
          services: [] as User['services'], // Provide default empty services array
          allow_workspace_creation: user.allow_workspace_creation ?? false, // Provide default value
        })),
        userCount: countData || 0,
      };
    }

    // Regular query for when there's no search
    const queryBuilder = supabase
      .from('platform_user_roles')
      .select('*,...users!inner(*, ...user_private_details(*))', {
        count: 'exact',
      })
      .order('created_at', { ascending: false })
      .order('user_id');

    // Apply role filtering if specified
    if (role && role !== 'all') {
      switch (role) {
        case 'admin':
          queryBuilder.eq('allow_role_management', true);
          break;
        case 'global_manager':
          queryBuilder.eq('allow_manage_all_challenges', true);
          break;
        case 'challenge_manager':
          queryBuilder.eq('allow_challenge_management', true);
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

    // Apply enabled filtering if specified
    if (enabled) {
      queryBuilder.eq('enabled', enabled === 'true');
    }

    // Handle pagination
    const parsedPage = parseInt(page);
    const parsedSize = parseInt(pageSize);
    const start = (parsedPage - 1) * parsedSize;
    const end = parsedPage * parsedSize - 1;
    queryBuilder.range(start, end);

    const { data, error, count } = await queryBuilder;

    if (error) {
      console.error('Error fetching platform users:', error);
      return { userData: [], userCount: 0 };
    }

    return {
      userData: data || [],
      userCount: count || 0,
    };
  } catch (error) {
    console.error('Failed to fetch platform users:', error);
    return { userData: [], userCount: 0 };
  }
}
