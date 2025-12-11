import { createClient } from '@tuturuuu/supabase/next/server';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { Separator } from '@tuturuuu/ui/separator';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { CustomDataTable } from '@/components/custom-data-table';
import { type EmailAuditRecord, getEmailAuditColumns } from './columns';
import Filters from './filters';
import WorkspaceWrapper from '@/components/workspace-wrapper';

export const metadata: Metadata = {
  title: 'Email Audit',
  description:
    'View email sending audit logs in the Infrastructure area of your Tuturuuu workspace.',
};

interface SearchParams {
  q?: string;
  page?: number;
  pageSize?: number;
  status?: string;
  templateType?: string;
}

const SearchParamsSchema = z.object({
  q: z.string().default(''),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  status: z
    .enum(['pending', 'sent', 'failed', 'bounced', 'complained', ''])
    .default(''),
  templateType: z.string().default(''),
});

interface Props {
  params: Promise<{
    locale: string;
    wsId: string;
  }>;
  searchParams: Promise<SearchParams>;
}

export default async function EmailAuditPage({ params, searchParams }: Props) {
  return (
    <WorkspaceWrapper params={params}>
      {async ({ wsId, locale }) => {
        const t = await getTranslations();

        const { containsPermission } = await getPermissions({ wsId });
        const canViewInfrastructure = containsPermission('view_infrastructure');
        if (!canViewInfrastructure) {
          notFound();
        }

        const sp = SearchParamsSchema.parse(await searchParams);

        const { data, count } = await getData(sp);

        return (
          <>
            <FeatureSummary
              pluralTitle={t('email-audit.plural')}
              singularTitle={t('email-audit.singular')}
              description={t('email-audit.description')}
            />
            <Separator className="my-4" />
            <CustomDataTable
              data={data}
              namespace="email-audit-data-table"
              columnGenerator={getEmailAuditColumns}
              extraData={{
                locale,
              }}
              count={count}
              defaultVisibility={{
                id: false,
                content_hash: false,
                ip_address: false,
                user_agent: false,
                updated_at: false,
                cc_addresses: false,
                bcc_addresses: false,
                reply_to_addresses: false,
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
  status,
  templateType,
  retry = true,
}: SearchParams & { retry?: boolean } = {}): Promise<{
  data: EmailAuditRecord[];
  count: number;
}> {
  const supabase = await createClient();

  let queryBuilder = supabase
    .from('email_audit')
    .select(
      `
      *,
      users:user_id (
        id,
        display_name
      ),
      workspaces:ws_id (
        id,
        name
      )
    `,
      {
        count: 'exact',
      }
    )
    .order('created_at', { ascending: false });

  // Filter by status if provided
  if (status && status !== '') {
    queryBuilder = queryBuilder.eq('status', status);
  }

  // Filter by template type if provided
  if (templateType && templateType !== '') {
    queryBuilder = queryBuilder.eq('template_type', templateType);
  }

  // Search filter (search in subject, source_email, and to_addresses)
  if (q) {
    queryBuilder = queryBuilder.or(
      `subject.ilike.%${q}%,source_email.ilike.%${q}%,source_name.ilike.%${q}%`
    );
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
      status,
      templateType,
      retry: false,
    });
  }

  return {
    data: (data || []) as EmailAuditRecord[],
    count: count || 0,
  };
}
