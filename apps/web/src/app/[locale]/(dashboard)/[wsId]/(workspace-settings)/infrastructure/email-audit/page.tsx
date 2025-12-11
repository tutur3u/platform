import { createClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { z } from 'zod';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import { type EmailAuditRecord } from './columns';
import { EmailAuditTable } from './email-audit-table';
import Filters from './filters';

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
  provider?: string;
  dateRange?: string;
  entityType?: string;
  errorFilter?: string;
}

const SearchParamsSchema = z.object({
  q: z.string().default(''),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  status: z
    .enum(['pending', 'sent', 'failed', 'bounced', 'complained', ''])
    .default(''),
  templateType: z.string().default(''),
  provider: z.string().default(''),
  dateRange: z
    .enum(['today', 'yesterday', '7days', '30days', '90days', ''])
    .default(''),
  entityType: z.string().default(''),
  errorFilter: z.enum(['has-error', 'no-error', '']).default(''),
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
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-1">
              <h1 className="font-semibold text-2xl tracking-tight">
                {t('email-audit.plural')}
              </h1>
              <p className="text-muted-foreground text-sm">
                {t('email-audit.description')}
              </p>
            </div>

            <EmailAuditTable
              data={data}
              count={count}
              locale={locale}
              filters={<Filters key="email-audit-filters" />}
            />
          </div>
        );
      }}
    </WorkspaceWrapper>
  );
}

function getDateRangeFilter(
  dateRange: string
): { startDate: Date; endDate: Date } | null {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (dateRange) {
    case 'today':
      return {
        startDate: today,
        endDate: now,
      };
    case 'yesterday': {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      return {
        startDate: yesterday,
        endDate: today,
      };
    }
    case '7days': {
      const sevenDaysAgo = new Date(today);
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      return {
        startDate: sevenDaysAgo,
        endDate: now,
      };
    }
    case '30days': {
      const thirtyDaysAgo = new Date(today);
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      return {
        startDate: thirtyDaysAgo,
        endDate: now,
      };
    }
    case '90days': {
      const ninetyDaysAgo = new Date(today);
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
      return {
        startDate: ninetyDaysAgo,
        endDate: now,
      };
    }
    default:
      return null;
  }
}

async function getData({
  q,
  page = 1,
  pageSize = 10,
  status,
  templateType,
  provider,
  dateRange,
  entityType,
  errorFilter,
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

  // Filter by provider if provided
  if (provider && provider !== '') {
    queryBuilder = queryBuilder.eq('provider', provider);
  }

  // Filter by entity type if provided
  if (entityType && entityType !== '') {
    queryBuilder = queryBuilder.eq('entity_type', entityType);
  }

  // Filter by date range if provided
  if (dateRange && dateRange !== '') {
    const dateFilter = getDateRangeFilter(dateRange);
    if (dateFilter) {
      queryBuilder = queryBuilder
        .gte('created_at', dateFilter.startDate.toISOString())
        .lte('created_at', dateFilter.endDate.toISOString());
    }
  }

  // Filter by error status if provided
  if (errorFilter === 'has-error') {
    queryBuilder = queryBuilder.not('error_message', 'is', null);
  } else if (errorFilter === 'no-error') {
    queryBuilder = queryBuilder.is('error_message', null);
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
      provider,
      dateRange,
      entityType,
      errorFilter,
      retry: false,
    });
  }

  return {
    data: (data || []) as EmailAuditRecord[],
    count: count || 0,
  };
}
