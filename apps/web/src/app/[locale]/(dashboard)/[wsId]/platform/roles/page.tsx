import { createClient } from '@tuturuuu/supabase/next/server';
import type {
  PlatformUser,
  User,
  UserPrivateDetails,
} from '@tuturuuu/types/db';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
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
  email: string;
  new_email: string;
  birthday: string;
  team_name: string[];
};

// Create a compatible type that merges the search result with required User fields
type PlatformUserWithDetails = Omit<User, 'services'> &
  PlatformUser &
  Partial<UserPrivateDetails> & {
    services?: User['services']; // Make services optional since RPC doesn't return it
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

  return (
    <>
      <FeatureSummary
        pluralTitle={t('platform-roles.plural')}
        description={t('platform-roles.description')}
      />
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
          })),
          userCount: (data || []).length,
        };
      }

      return {
        userData: (data || []).map((user: SearchUserResult) => ({
          ...user,
          services: [] as User['services'], // Provide default empty services array
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
        default:
          queryBuilder
            .eq('allow_challenge_management', false)
            .eq('allow_manage_all_challenges', false)
            .eq('allow_role_management', false);
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
