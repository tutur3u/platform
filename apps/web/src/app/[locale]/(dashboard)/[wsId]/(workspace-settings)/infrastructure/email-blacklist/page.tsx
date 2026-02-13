import { createClient } from '@tuturuuu/supabase/next/server';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { Separator } from '@tuturuuu/ui/separator';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { z } from 'zod';
import { CustomDataTable } from '@/components/custom-data-table';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import { getEmailBlacklistColumns } from './columns';
import Filters from './filters';
import EmailBlacklistForm from './form';

export const metadata: Metadata = {
  title: 'Email Blacklist',
  description:
    'Manage Email Blacklist in the Infrastructure area of your Tuturuuu workspace.',
};

interface SearchParams {
  q?: string;
  page?: number;
  pageSize?: number;
  type?: string;
}

const SearchParamsSchema = z.object({
  q: z.string().default(''),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  type: z.enum(['email', 'domain', '']).default(''),
});

interface Props {
  params: Promise<{
    locale: string;
    wsId: string;
  }>;
  searchParams: Promise<SearchParams>;
}

export default async function EmailBlacklistPage({
  params,
  searchParams,
}: Props) {
  return (
    <WorkspaceWrapper params={params}>
      {async ({ wsId, locale }) => {
        const t = await getTranslations();

        const permissions = await getPermissions({ wsId });
        if (!permissions) notFound();
        const { containsPermission } = permissions;
        const canViewInfrastructure = containsPermission('view_infrastructure');
        if (!canViewInfrastructure) {
          notFound();
        }

        const sp = SearchParamsSchema.parse(await searchParams);

        const { data, count } = await getData(sp);

        return (
          <>
            <FeatureSummary
              pluralTitle={t('email-blacklist.plural')}
              singularTitle={t('email-blacklist.singular')}
              description={t('email-blacklist.description')}
              createTitle={t('email-blacklist.create')}
              createDescription={t('email-blacklist.create_description')}
              form={<EmailBlacklistForm />}
            />
            <Separator className="my-4" />
            <CustomDataTable
              data={data}
              namespace="email-blacklist-data-table"
              columnGenerator={getEmailBlacklistColumns}
              extraData={{
                locale,
              }}
              count={count}
              defaultVisibility={{
                id: false,
                created_at: false,
                updated_at: false,
                added_by_user_id: false,
              }}
              filters={<Filters />}
            />
          </>
        );
      }}
    </WorkspaceWrapper>
  );
}

async function getData({
  q,
  page = 1,
  pageSize = 10,
  type,
  retry = true,
}: SearchParams & { retry?: boolean } = {}) {
  const supabase = await createClient();

  let queryBuilder = supabase
    .from('email_blacklist')
    .select(
      `
      *,
      users:added_by_user_id (
        id,
        display_name
      )
    `,
      {
        count: 'exact',
      }
    )
    .order('created_at', { ascending: false });

  // Filter by type if provided
  if (type && type !== '') {
    queryBuilder = queryBuilder.eq('entry_type', type as 'email' | 'domain');
  }

  // Search filter
  if (q) {
    queryBuilder = queryBuilder.or(`value.ilike.%${q}%,reason.ilike.%${q}%`);
  }

  // Pagination
  if (page && pageSize) {
    const start = (page - 1) * pageSize;
    const end = start + pageSize - 1;
    queryBuilder = queryBuilder.range(start, end);
  }

  const { data, error, count } = await queryBuilder;

  if (error) {
    if (!retry) throw error;
    return getData({
      q,
      page,
      pageSize,
      type,
      retry: false,
    });
  }

  return {
    data: data || [],
    count: count || 0,
  };
}
