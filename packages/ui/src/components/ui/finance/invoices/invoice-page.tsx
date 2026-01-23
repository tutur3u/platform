import { FileCheck2, Plus } from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/server';
import type { Invoice } from '@tuturuuu/types/primitives/Invoice';
import { transformInvoiceSearchResults } from '@tuturuuu/utils/finance/transform-invoice-results';
import { getPermissions, getWorkspace } from '@tuturuuu/utils/workspace-helper';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { z } from 'zod';
import { Button } from '../../button';
import FeatureSummary from '../../custom/feature-summary';
import { Separator } from '../../separator';
import { Skeleton } from '../../skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../tabs';
import { InvoiceTotalsChartSkeleton } from './charts/invoice-totals-chart';
import { InvoiceAnalytics } from './invoice-analytics';
import { InvoicesTable } from './invoices-table';
import { PendingInvoicesTab } from './pending-invoices-tab';
import { PendingInvoicesTable } from './pending-invoices-table';

type DeleteInvoiceAction = (
  wsId: string,
  invoiceId: string
) => Promise<{ success: boolean; message?: string }>;

/**
 * Fetches the first day of week preference for a user/workspace
 * Returns: 0 (Sunday), 1 (Monday), or 6 (Saturday)
 */
async function getWeekStartsOn(wsId: string): Promise<0 | 1 | 6> {
  const supabase = await createClient();

  // Get current user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Try user preference first
  if (user) {
    const { data: userData } = await supabase
      .from('users')
      .select('first_day_of_week')
      .eq('id', user.id)
      .single();

    if (userData?.first_day_of_week && userData.first_day_of_week !== 'auto') {
      return firstDayStringToNumber(userData.first_day_of_week);
    }
  }

  // Fall back to workspace preference
  const { data: workspaceData } = await supabase
    .from('workspaces')
    .select('first_day_of_week')
    .eq('id', wsId)
    .single();

  if (
    workspaceData?.first_day_of_week &&
    workspaceData.first_day_of_week !== 'auto'
  ) {
    return firstDayStringToNumber(workspaceData.first_day_of_week);
  }

  // Default to Monday (most common business standard)
  return 1;
}

function firstDayStringToNumber(day: string): 0 | 1 | 6 {
  switch (day) {
    case 'sunday':
      return 0;
    case 'monday':
      return 1;
    case 'saturday':
      return 6;
    default:
      return 1;
  }
}

interface Props {
  params: Promise<{
    wsId: string;
  }>;
  searchParams: Promise<{
    q: string;
    page: string;
    pageSize: string;
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
  const resolvedSearchParams = await searchParams;

  const workspace = await getWorkspace(id);
  const wsId = workspace.id;
  const [initialData, weekStartsOn] = await Promise.all([
    getInitialData(wsId, resolvedSearchParams),
    getWeekStartsOn(wsId),
  ]);

  const { containsPermission } = await getPermissions({
    wsId,
  });

  const canExportFinanceData = containsPermission('export_finance_data');

  return (
    <>
      <FeatureSummary
        pluralTitle={t('ws-invoices.plural')}
        singularTitle={t('ws-invoices.singular')}
        description={t('ws-invoices.description')}
        createTitle={t('ws-invoices.create')}
        createDescription={t('ws-invoices.create_description')}
        action={
          <div className="flex gap-2">
            {canCreateInvoices && (
              <Link href={`/${wsId}/finance/invoices/new`}>
                <Button>
                  <Plus />
                  {t('ws-invoices.create')}
                </Button>
              </Link>
            )}
          </div>
        }
      />
      <Separator className="my-4" />

      <Suspense fallback={<InvoiceTotalsChartSkeleton className="mb-4" />}>
        <InvoiceAnalytics
          wsId={wsId}
          weekStartsOn={weekStartsOn}
          className="mb-4"
        />
      </Suspense>

      <Tabs defaultValue="created" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="created" className="gap-2">
            <FileCheck2 className="h-4 w-4" />
            {t('ws-invoices.created_invoices')}
          </TabsTrigger>
          <PendingInvoicesTab
            wsId={wsId}
            label={t('ws-invoices.pending_invoices')}
          />
        </TabsList>
        <TabsContent value="created">
          <Suspense fallback={<Skeleton className="h-125 w-full" />}>
            <InvoicesTable
              wsId={wsId}
              canDeleteInvoices={canDeleteInvoices}
              canExport={canExportFinanceData}
              deleteInvoiceAction={deleteInvoiceAction}
              initialData={initialData}
            />
          </Suspense>
        </TabsContent>
        <TabsContent value="pending">
          <Suspense fallback={<Skeleton className="h-125 w-full" />}>
            <PendingInvoicesTable
              wsId={wsId}
              canExport={canExportFinanceData}
            />
          </Suspense>
        </TabsContent>
      </Tabs>
    </>
  );
}

/**
 * Fetches initial page of invoices for SSR hydration
 */
async function getInitialData(
  wsId: string,
  {
    q,
    page = '1',
    pageSize = '10',
  }: {
    q?: string;
    page?: string;
    pageSize?: string;
  }
) {
  const supabase = await createClient();

  // Validate and coerce pagination parameters
  const paginationSchema = z.object({
    page: z
      .string()
      .transform((val) => parseInt(val, 10))
      .refine((val) => !Number.isNaN(val), 'page must be a valid number')
      .pipe(
        z
          .number()
          .int('page must be an integer')
          .min(1, 'page must be at least 1')
      )
      .default(1)
      .catch(1),
    pageSize: z
      .string()
      .transform((val) => parseInt(val, 10))
      .refine((val) => !Number.isNaN(val), 'pageSize must be a valid number')
      .pipe(
        z
          .number()
          .int('pageSize must be an integer')
          .min(1, 'pageSize must be at least 1')
          .max(100, 'pageSize must not exceed 100')
      )
      .default(10)
      .catch(10),
  });

  const { page: parsedPage, pageSize: parsedSize } = paginationSchema.parse({
    page: page ?? '1',
    pageSize: pageSize ?? '10',
  });

  // If there's a search query, use the RPC function for customer name search
  if (q) {
    const { data: searchResults, error: rpcError } = await supabase.rpc(
      'search_finance_invoices',
      {
        p_ws_id: wsId,
        p_search_query: q,
        p_start_date: undefined,
        p_end_date: undefined,
        p_user_ids: undefined,
        p_wallet_ids: undefined,
        p_limit: parsedSize,
        p_offset: (parsedPage - 1) * parsedSize,
      }
    );

    if (rpcError) throw rpcError;

    // Extract count from first row
    const count = searchResults?.[0]?.total_count || 0;

    // Fetch additional data for legacy/platform creators and wallet info
    const invoiceIds = searchResults.map((r) => r.id);
    if (invoiceIds.length === 0) {
      return { data: [], count: 0 };
    }

    const { data: fullInvoices } = await supabase
      .from('finance_invoices')
      .select(
        `*, 
         legacy_creator:workspace_users!creator_id(id, full_name, display_name, email, avatar_url), 
         platform_creator:users!platform_creator_id(id, display_name, avatar_url, user_private_details(full_name, email)),
         wallet_transactions!finance_invoices_transaction_id_fkey(wallet:workspace_wallets(name))`
      )
      .in('id', invoiceIds);

    // Transform search results using shared utility
    const data = transformInvoiceSearchResults(
      searchResults,
      fullInvoices || []
    );

    return { data, count } as { data: Invoice[]; count: number };
  }

  // No search query - use regular query builder
  const selectQuery = `*, customer:workspace_users!customer_id(full_name, avatar_url), legacy_creator:workspace_users!creator_id(id, full_name, display_name, email, avatar_url), platform_creator:users!platform_creator_id(id, display_name, avatar_url, user_private_details(full_name, email)), wallet_transactions!finance_invoices_transaction_id_fkey(wallet:workspace_wallets(name))`;

  const startRange = (parsedPage - 1) * parsedSize;
  const endRange = parsedPage * parsedSize;

  const {
    data: rawData,
    error,
    count,
  } = await supabase
    .from('finance_invoices')
    .select(selectQuery, {
      count: 'exact',
    })
    .eq('ws_id', wsId)
    .order('created_at', { ascending: false })
    .range(startRange, endRange)
    .limit(parsedSize);
  if (error) throw error;

  const data = rawData.map(
    ({
      customer,
      legacy_creator,
      platform_creator,
      wallet_transactions,
      ...rest
    }: any) => {
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

      const wallet = wallet_transactions?.wallet
        ? { name: wallet_transactions.wallet.name }
        : null;

      return {
        ...rest,
        customer,
        creator,
        wallet,
      };
    }
  );

  return { data, count } as { data: Invoice[]; count: number };
}
