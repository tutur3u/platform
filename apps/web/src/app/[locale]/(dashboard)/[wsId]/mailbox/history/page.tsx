import { getUserColumns } from '../../users/database/columns';
import Filters from '../../users/database/filters';
import { getEmailColumns } from './columns';
import { CustomDataTable } from '@/components/custom-data-table';
import { verifyHasSecrets } from '@/lib/workspace-helper';
import type { WorkspaceUser } from '@/types/primitives/WorkspaceUser';
import type { WorkspaceUserField } from '@/types/primitives/WorkspaceUserField';
import { createClient } from '@/utils/supabase/server';
import FeatureSummary from '@repo/ui/components/ui/custom/feature-summary';
import { Separator } from '@repo/ui/components/ui/separator';
import { getTranslations } from 'next-intl/server';

interface SearchParams {
  q?: string;
  page?: string;
  pageSize?: string;
  includedGroups?: string | string[];
  excludedGroups?: string | string[];
}

interface sentEmail {
  created_at?: string;
  sender_id?: string;
  receiver_id?: string;
  context?: string;
  post_id?: string;
  email?: string;
}
interface Props {
  params: {
    locale: string;
    wsId: string;
  };
  searchParams: SearchParams;
}

export default async function WorkspaceUsersPage({
  params: { locale, wsId },
  searchParams,
}: Props) {
  await verifyHasSecrets(wsId, ['ENABLE_USERS'], `/${wsId}`);
  const t = await getTranslations('ws-users');

  const { data, count } = await getData(wsId, searchParams);
  // const { data: posts } = await getGroupPosts(groupId);
  const { data: extraFields } = await getUserFields();

  const users = data.map((u) => ({
    ...u,
    href: `/${wsId}/users/database/${u.id}`,
  }));

  return (
    <>
      <FeatureSummary
        pluralTitle={t('plural')}
        singularTitle={t('singular')}
        description={t('description')}
        createTitle={t('create')}
        createDescription={t('create_description')}
      />
      <Separator className="my-4" />
      <CustomDataTable
        data={users}
        namespace="user-data-table"
        columnGenerator={getEmailColumns}
        extraColumns={extraFields}
        extraData={{ locale }}
        count={count}
        filters={<Filters wsId={wsId} searchParams={searchParams} noExclude />}
        defaultVisibility={{
          id: false,
          gender: false,
          avatar_url: false,
          display_name: false,
          ethnicity: false,
          guardian: false,
          address: false,
          national_id: false,
          note: false,
          linked_users: false,
          group_count: false,
          created_at: false,
          updated_at: false,

          // Extra columns
          ...Object.fromEntries(extraFields.map((field) => [field.id, false])),
        }}
      />
    </>
  );
}

async function getData(
  wsId: string,
  {
    q,
    page = '1',
    pageSize = '10',
    includedGroups = [],
    excludedGroups = [],
    retry = true,
  }: SearchParams & { retry?: boolean } = {}
) {
  const supabase = createClient();

  const queryBuilder = supabase.from('send_emails').select('*');

  if (page && pageSize) {
    const parsedPage = Number.parseInt(page);
    const parsedSize = Number.parseInt(pageSize);
    const start = (parsedPage - 1) * parsedSize;
    const end = parsedPage * parsedSize;
    queryBuilder.range(start, end).limit(parsedSize);
  }

  const { data, error, count } = await queryBuilder;

  if (error) {
    if (!retry) throw error;
    return getData(wsId, { q, pageSize, retry: false });
  }

  return { data, count } as unknown as { data: sentEmail[]; count: number };
}

async function getUserFields() {
  const supabase = createClient();

  const queryBuilder = supabase.from('send_emails').select('*');

  const { data, error, count } = await queryBuilder;
  if (error) throw error;

  return { data, count } as { data: WorkspaceUserField[]; count: number };
}
