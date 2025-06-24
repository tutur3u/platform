import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type {
  PlatformUser,
  User,
  UserPrivateDetails,
} from '@tuturuuu/types/db';
import { Button } from '@tuturuuu/ui/button';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { Mail } from '@tuturuuu/ui/icons';
import { Separator } from '@tuturuuu/ui/separator';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import { CustomDataTable } from '@/components/custom-data-table';
import { getUserColumns } from './columns';
import EnabledFilter from './enabled-filter';
import RoleFilter from './role-filter';

interface props {
  params: Promise<{
    wsId: string;
  }>;
  searchParams: Promise<{
    q?: string;
    page?: string;
    pageSize?: string;
    tab?: string;
    role?: string;
    enabled?: string;
  }>;
}

export default async function UserManagement({ params, searchParams }: props) {
  const locale = await getLocale();
  const { wsId } = await params;
  const {
    q,
    page,
    pageSize,
    tab = 'users',
    role,
    enabled,
  } = await searchParams;

  // Fetch user data
  const { userData, userCount } = await getUserData({
    q: tab === 'users' ? q : undefined,
    page: tab === 'users' ? page || '1' : '1',
    pageSize: tab === 'users' ? pageSize || '10' : '10',
    role,
    enabled,
  });

  return (
    <div className="p-4 md:p-8">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <Link href={`/${wsId}/users/whitelist`}>
          <Button variant="outline" className="flex items-center gap-2">
            <Mail className="h-4 w-4" />
            <span>Manage Email Whitelist</span>
          </Button>
        </Link>

        <div className="flex flex-wrap items-center gap-4">
          <EnabledFilter currentEnabled={enabled} />
          <RoleFilter currentRole={role} />
        </div>
      </div>

      <div className="mt-4">
        <FeatureSummary
          pluralTitle="User Management"
          description="This page is for user management"
        />
      </div>
      <Separator className="my-4" />

      <CustomDataTable
        data={userData}
        columnGenerator={getUserColumns}
        count={userCount}
        extraData={{ locale }}
        defaultVisibility={{
          id: false,
          created_at: false,
        }}
      />
    </div>
  );
}

async function getUserData({
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
  userData: (User &
    PlatformUser &
    Partial<UserPrivateDetails> & { team_name: string[] })[];
  userCount: number;
}> {
  try {
    const sbAdmin = await createAdminClient();
    if (!sbAdmin) notFound();

    // If there's a search query, use the RPC function
    if (q) {
      // Use type assertion to overcome TypeScript issues
      const { data, error } = await sbAdmin.rpc('search_users', {
        search_query: q,
        page_number: parseInt(page),
        page_size: parseInt(pageSize),
        role_filter: role && role !== 'all' ? role : null,
        enabled_filter: enabled ? enabled === 'true' : null,
      } as any);

      if (error) {
        console.error('Error searching users:', error);
        return { userData: [], userCount: 0 };
      }

      // Get count for pagination
      const { data: countData, error: countError } = await sbAdmin.rpc(
        'count_search_users',
        {
          search_query: q,
          role_filter: role && role !== 'all' ? role : null,
          enabled_filter: enabled ? enabled === 'true' : null,
        } as any
      );

      if (countError) {
        console.error('Error getting count:', countError);
        return {
          userData: (data || [])
            .map((user: any) => ({
              ...user,
              services: user.services || [],
            }))
            .filter((user: any) => user.services?.includes('UPSKII')),
          userCount: (data || []).filter((user: any) =>
            user.services?.includes('UPSKII')
          ).length,
        };
      }

      return {
        userData: (data || [])
          .map((user: any) => ({
            ...user,
            services: user.services || [],
          }))
          .filter((user: any) => user.services?.includes('UPSKII')),
        userCount: countData || 0,
      };
    }

    // Regular query for when there's no search
    const queryBuilder = sbAdmin
      .from('platform_user_roles')
      .select(
        '*,...users!inner(*, ...user_private_details!inner(*), nova_team_members(...nova_teams!inner(team_name:name)))',
        {
          count: 'exact',
        }
      )
      .contains('users.services', ['UPSKII'])
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
      console.error('Error fetching users:', error);
      return { userData: [], userCount: 0 };
    }

    return {
      userData:
        data.map(({ nova_team_members, ...user }) => ({
          ...user,
          services: user.services || [],
          team_name:
            nova_team_members
              ?.map((member) => member.team_name)
              .filter(Boolean) || [],
        })) || [],
      userCount: count || 0,
    };
  } catch (error) {
    console.error('Failed to fetch users:', error);
    return { userData: [], userCount: 0 };
  }
}
