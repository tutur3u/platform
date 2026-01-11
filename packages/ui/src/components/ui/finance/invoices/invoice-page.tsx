import { Plus } from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/server';
import type { Invoice } from '@tuturuuu/types/primitives/Invoice';
import { Button } from '@tuturuuu/ui/button';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { CustomDataTable } from '@tuturuuu/ui/custom/tables/custom-data-table';
import { DateRangeFilterWrapper } from '@tuturuuu/ui/finance/shared/date-range-filter-wrapper';
import { Separator } from '@tuturuuu/ui/separator';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { invoiceColumns } from './columns';
import { PendingInvoicesTable } from './pending-invoices-table';
import { UserFilterWrapper } from './user-filter-wrapper';

type DeleteInvoiceAction = (
  wsId: string,
  invoiceId: string
) => Promise<{ success: boolean; message?: string }>;

interface Props {
  params: Promise<{
    wsId: string;
  }>;
  searchParams: Promise<{
    q: string;
    page: string;
    pageSize: string;
    start: string;
    end: string;
    userIds: string | string[];
  }>;
  canCreateInvoices?: boolean;
  canDeleteInvoices?: boolean;
  deleteInvoiceAction?: DeleteInvoiceAction;
}

export default async function InvoicesPage({
  params,
  searchParams,
  canCreateInvoices = false,
  canDeleteInvoices = false,
  deleteInvoiceAction,
}: Props) {
  const t = await getTranslations();
  const { wsId: id } = await params;

  const workspace = await getWorkspace(id);
  const wsId = workspace.id;
  const { data: rawData, count } = await getData(wsId, await searchParams);

  const data = rawData.map((d) => ({
    ...d,
    href: `/${wsId}/finance/invoices/${d.id}`,
    ws_id: wsId,
  }));

  return (
    <>
      <FeatureSummary
        pluralTitle={t('ws-invoices.plural')}
        singularTitle={t('ws-invoices.singular')}
        description={t('ws-invoices.description')}
        createTitle={t('ws-invoices.create')}
        createDescription={t('ws-invoices.create_description')}
        action={
          canCreateInvoices ? (
            <Link href={`/${wsId}/finance/invoices/new`}>
              <Button>
                <Plus />
                {t('ws-invoices.create')}
              </Button>
            </Link>
          ) : null
        }
      />
      <Separator className="my-4" />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Suspense fallback={<Skeleton className="h-10 w-50" />}>
          <UserFilterWrapper wsId={wsId} />
        </Suspense>
        <Suspense fallback={<Skeleton className="h-10 w-75" />}>
          <DateRangeFilterWrapper />
        </Suspense>
      </div>
      <Tabs defaultValue="created" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="created">
            {t('ws-invoices.created_invoices')}
          </TabsTrigger>
          <TabsTrigger value="pending">
            {t('ws-invoices.pending_invoices')}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="created">
          <CustomDataTable
            data={data}
            columnGenerator={invoiceColumns}
            namespace="invoice-data-table"
            count={count}
            extraData={{
              canDeleteInvoices,
              deleteInvoiceAction,
            }}
            defaultVisibility={{
              id: false,
              customer_id: false,
              price: false,
              total_diff: false,
              note: false,
            }}
          />
        </TabsContent>
        <TabsContent value="pending">
          <PendingInvoicesTable wsId={wsId} />
        </TabsContent>
      </Tabs>
    </>
  );
}

async function getData(
  wsId: string,
  {
    // q,
    page = '1',
    pageSize = '10',
    start,
    end,
    userIds,
  }: {
    q?: string;
    page?: string;
    pageSize?: string;
    start?: string;
    end?: string;
    userIds?: string | string[];
  }
) {
  const supabase = await createClient();

  let queryBuilder = supabase
    .from('finance_invoices')
    .select(
      '*, customer:workspace_users!customer_id(full_name, avatar_url), legacy_creator:workspace_users!creator_id(id, full_name, display_name, email, avatar_url), platform_creator:users!platform_creator_id(id, display_name, avatar_url, user_private_details(full_name, email))',
      {
        count: 'exact',
      }
    )
    .eq('ws_id', wsId)
    .order('created_at', { ascending: false });

  if (start && end) {
    queryBuilder = queryBuilder.gte('created_at', start).lte('created_at', end);
  }

  if (userIds) {
    const ids = Array.isArray(userIds) ? userIds : [userIds];
    if (ids.length > 0) {
      queryBuilder = queryBuilder.in('creator_id', ids);
    }
  }

  if (page && pageSize) {
    const parsedPage = parseInt(page, 10);
    const parsedSize = parseInt(pageSize, 10);
    const start = (parsedPage - 1) * parsedSize;
    const end = parsedPage * parsedSize;
    queryBuilder = queryBuilder.range(start, end).limit(parsedSize);
  }

  const { data: rawData, error, count } = await queryBuilder;
  if (error) throw error;

  const data = rawData.map(
    ({ customer, legacy_creator, platform_creator, ...rest }) => {
      const platformCreator = platform_creator as {
        id: string;
        display_name: string | null;
        avatar_url: string | null;
        user_private_details: {
          full_name: string | null;
          email: string | null;
        } | null;
      } | null;

      const legacyCreator = legacy_creator as {
        id: string;
        display_name: string | null;
        full_name: string | null;
        email: string | null;
        avatar_url: string | null;
      } | null;

      const creator = {
        id: platformCreator?.id ?? legacyCreator?.id ?? '',
        display_name:
          platformCreator?.display_name ??
          legacyCreator?.display_name ??
          platformCreator?.user_private_details?.email ??
          null,
        full_name:
          platformCreator?.user_private_details?.full_name ??
          legacyCreator?.full_name ??
          null,
        email:
          platformCreator?.user_private_details?.email ??
          legacyCreator?.email ??
          null,
        avatar_url:
          platformCreator?.avatar_url ?? legacyCreator?.avatar_url ?? null,
      };

      return {
        ...rest,
        customer,
        creator,
      };
    }
  );

  return { data, count } as { data: Invoice[]; count: number };
}
