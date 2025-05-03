import { getUserColumns } from './columns';
import { CustomDataTable } from '@/components/custom-data-table';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { User, UserPrivateDetails } from '@tuturuuu/types/db';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { Separator } from '@tuturuuu/ui/separator';
import { generateFunName } from '@tuturuuu/utils/name-helper';
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
}): Promise<{ userData: (User & UserPrivateDetails)[]; userCount: number }> {
  try {
    const sbAdmin = await createAdminClient();

    const queryBuilder = sbAdmin
      .from('platform_user_roles')
      .select('...users!inner(*, ...user_private_details!inner(*))', {
        count: 'exact',
      })
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
