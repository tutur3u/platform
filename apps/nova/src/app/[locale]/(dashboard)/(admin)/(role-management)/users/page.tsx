import UsersClient from './client';
import { getUserColumns } from './columns';
import { CustomDataTable } from '@/components/custom-data-table';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { Separator } from '@tuturuuu/ui/separator';
import { generateFunName } from '@tuturuuu/utils/name-helper';
import { getLocale } from 'next-intl/server';

export default async function UserManagement({
  searchParams,
}: {
  searchParams: { q?: string; page?: string; pageSize?: string };
}) {
  const locale = await getLocale();
  const { userData, userCount } = await getUserData({
    q: searchParams.q,
    page: searchParams.page || '1',
    pageSize: searchParams.pageSize || '10',
  });

  console.log('user', userData);

  // Process users to ensure they have display names
  const processedUsers = userData.map((user) => {
    const displayName =
      user.display_name || generateFunName({ id: user.id, locale });

    return {
      ...user,
      display_name: displayName,
    };
  });

  return (
    <div className="p-4 md:p-8">
      <FeatureSummary
        pluralTitle="User Management"
        description="This page is for user management"
      />
      <Separator className="my-4" />
      <CustomDataTable
        data={processedUsers}
        columnGenerator={getUserColumns}
        count={userCount}
        // namespace="admin.user-management"
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
}) {
  try {
    const sbAdmin = await createAdminClient();

    const queryBuilder = sbAdmin
      .from('users')
      .select('id, display_name, created_at, avatar_url', { count: 'exact' })
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
      userData: data || [],
      userCount: count || 0,
    };
  } catch (error) {
    console.error('Failed to fetch users:', error);
    return { userData: [], userCount: 0 };
  }
}
