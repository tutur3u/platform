import { getUserColumns } from './columns';
import { TabSelector } from './tabs-selectors';
import WhitelistEmailClient from './whitelist-client-page';
import { getNovaRoleColumns } from './whitelist-columns';
import { CustomDataTable } from '@/components/custom-data-table';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type {
  PlatformUser,
  User,
  UserPrivateDetails,
} from '@tuturuuu/types/db';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { Separator } from '@tuturuuu/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { getLocale, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';

interface props {
  params: Promise<{
    wsId: string;
  }>;
  searchParams: Promise<{
    q?: string;
    page?: string;
    pageSize?: string;
    tab?: string;
  }>;
}

export default async function UserManagement({ params, searchParams }: props) {
  const t = await getTranslations();
  const locale = await getLocale();
  const { q, page, pageSize, tab = 'users' } = await searchParams;
  const { wsId } = await params;

  // Fetch user data
  const { userData, userCount } = await getUserData({
    q: tab === 'users' ? q : undefined,
    page: tab === 'users' ? page || '1' : '1',
    pageSize: tab === 'users' ? pageSize || '10' : '10',
  });

  // Fetch role data
  const { emailData, emailCount } = await getWhitelistData(wsId, {
    q: tab === 'whitelist' ? q : undefined,
    page: tab === 'whitelist' ? page || '1' : '1',
    pageSize: tab === 'whitelist' ? pageSize || '10' : '10',
  });

  return (
    <div className="p-4 md:p-8">
      <TabSelector defaultTab={tab}>
        <TabsContent value="users">
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
            preserveParams={['tab']}
            defaultVisibility={{
              id: false,
              created_at: false,
            }}
          />
        </TabsContent>

        <TabsContent value="whitelist">
          <FeatureSummary
            pluralTitle={t('ws-ai-whitelist-emails.plural')}
            singularTitle={t('ws-ai-whitelist-emails.singular')}
            description={t('ws-ai-whitelist-emails.description')}
            createTitle={t('ws-ai-whitelist-emails.create')}
            createDescription={t('ws-ai-whitelist-emails.create_description')}
            form={<WhitelistEmailClient wsId={wsId} />}
          />
          <Separator className="my-4" />

          <CustomDataTable
            data={emailData}
            columnGenerator={getNovaRoleColumns}
            count={emailCount}
            preserveParams={['tab']}
          />
        </TabsContent>
      </TabSelector>
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
      // With separate calls:
      queryBuilder.or(`users.display_name.ilike.%${q}%`);
      queryBuilder.or(`user_private_details.email.ilike.%${q}%`);
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

async function getWhitelistData(
  wsId: string,
  {
    q,
    page = '1',
    pageSize = '10',
    retry = true,
  }: { q?: string; page?: string; pageSize?: string; retry?: boolean } = {}
) {
  const supabase = await createAdminClient();
  if (!supabase) notFound();

  const queryBuilder = supabase
    .from('platform_email_roles')
    .select('email, enabled, created_at', {
      count: 'exact',
    })
    .order('created_at', { ascending: false });

  if (q) queryBuilder.ilike('email', `%${q}%`);

  if (page && pageSize) {
    const parsedPage = parseInt(page);
    const parsedSize = parseInt(pageSize);
    const start = (parsedPage - 1) * parsedSize;
    const end = parsedPage * parsedSize;
    queryBuilder.range(start, end).limit(parsedSize);
  }

  const { data, error, count } = await queryBuilder;
  if (error) {
    if (!retry) throw error;
    return getWhitelistData(wsId, { q, pageSize, retry: false });
  }

  return {
    emailData: data,
    emailCount: count,
  };
}
