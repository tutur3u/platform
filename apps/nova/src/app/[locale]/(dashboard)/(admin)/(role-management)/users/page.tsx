import { getUserColumns } from './columns';
import { CustomDataTable } from '@/components/custom-data-table';
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
import { getLocale } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';

interface props {
  searchParams: Promise<{
    q?: string;
    page?: string;
    pageSize?: string;
    tab?: string;
  }>;
}

export default async function UserManagement({ searchParams }: props) {
  const locale = await getLocale();
  const { q, page, pageSize, tab = 'users' } = await searchParams;

  // Fetch user data
  const { userData, userCount } = await getUserData({
    q: tab === 'users' ? q : undefined,
    page: tab === 'users' ? page || '1' : '1',
    pageSize: tab === 'users' ? pageSize || '10' : '10',
  });

  return (
    <div className="p-4 md:p-8">
      <Link href={`/users/whitelist`}>
        <Button variant="outline" className="flex items-center gap-2">
          <Mail className="h-4 w-4" />
          <span>Manage Email Whitelist</span>
        </Button>
      </Link>

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
}: {
  q?: string;
  page?: string;
  pageSize?: string;
}): Promise<{
  userData: (User &
    PlatformUser &
    UserPrivateDetails & { team_name: string[] })[];
  userCount: number;
}> {
  try {
    const sbAdmin = await createAdminClient();
    if (!sbAdmin) notFound();

    // If there's a search query, use the RPC function
    if (q) {
      const { data, error } = await sbAdmin.rpc('search_users', {
        search_query: q,
        page_number: parseInt(page),
        page_size: parseInt(pageSize),
      });

      if (error) {
        console.error('Error searching users:', error);
        return { userData: [], userCount: 0 };
      }

      // Get count for pagination
      const { data: countData, error: countError } = await sbAdmin.rpc(
        'count_search_users',
        {
          search_query: q,
        }
      );

      if (countError) {
        console.error('Error getting count:', countError);
        return { userData: data || [], userCount: data?.length || 0 };
      }

      return {
        userData: data || [],
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
      .order('created_at', { ascending: false })
      .order('user_id');

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
