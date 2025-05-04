import { getUserColumns } from './columns';
import { CustomDataTable } from '@/components/custom-data-table';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type {
  PlatformUser,
  User,
  UserPrivateDetails,
} from '@tuturuuu/types/db';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { Separator } from '@tuturuuu/ui/separator';
import { getLocale } from 'next-intl/server';

export default async function UserManagement({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; pageSize?: string }>;
}) {
  const locale = await getLocale();
  const { q, page, pageSize } = await searchParams;
  const { userData, userCount } = await getUserData({
    q,
    page: page || '1',
    pageSize: pageSize || '10',
  });

  return (
    <div className="p-4 md:p-8">
      <FeatureSummary
        pluralTitle="User Management"
        description="This page is for user management"
      />
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

    const queryBuilder = sbAdmin
      .from('platform_user_roles')
      .select(
        '*,...users!inner(*, ...user_private_details!inner(*), nova_team_members(...nova_teams!inner(team_name:name)))',
        {
          count: 'exact',
        }
      )
      .order('created_at', { ascending: false });

    if (q) {
      queryBuilder.or(`email.ilike.%${q}%,display_name.ilike.%${q}%`);
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
          team_name: nova_team_members.map((member) => member.team_name),
        })) || [],
      userCount: count || 0,
    };
  } catch (error) {
    console.error('Failed to fetch users:', error);
    return { userData: [], userCount: 0 };
  }
}
