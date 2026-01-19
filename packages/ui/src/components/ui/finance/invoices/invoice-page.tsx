import { FileCheck2, Plus } from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/server';
import type { Invoice } from '@tuturuuu/types/primitives/Invoice';
import { getPermissions, getWorkspace } from '@tuturuuu/utils/workspace-helper';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
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
import { buildInvoiceSearchOrQuery } from './utils';

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
    start: string;
    end: string;
    userIds: string | string[];
    walletIds: string | string[];
    walletId: string; // Keep for backward compat or singular case
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

  // Parse wallet IDs for analytics chart
  const walletIdsArray = (() => {
    const { walletIds, walletId } = resolvedSearchParams;
    const wallets = Array.isArray(walletIds)
      ? walletIds
      : walletIds
        ? [walletIds]
        : [];
    if (walletId) wallets.push(walletId);
    return Array.from(new Set(wallets.filter(Boolean)));
  })();

  // Parse user IDs for analytics chart
  const userIdsArray = (() => {
    const { userIds } = resolvedSearchParams;
    const users = Array.isArray(userIds) ? userIds : userIds ? [userIds] : [];
    return Array.from(new Set(users.filter(Boolean)));
  })();

  // Get date range from search params
  const { start: startDate, end: endDate } = resolvedSearchParams;

  // Build analytics filters object
  const analyticsFilters = {
    walletIds: walletIdsArray.length > 0 ? walletIdsArray : undefined,
    userIds: userIdsArray.length > 0 ? userIdsArray : undefined,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
  };

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
          filters={analyticsFilters}
          className="mb-4"
          weekStartsOn={weekStartsOn}
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
    start,
    end,
    userIds,
    walletIds,
    walletId,
  }: {
    q?: string;
    page?: string;
    pageSize?: string;
    start?: string;
    end?: string;
    userIds?: string | string[];
    walletIds?: string | string[];
    walletId?: string;
  }
) {
  const supabase = await createClient();

  // Combine walletId and walletIds
  let wallets = Array.isArray(walletIds)
    ? walletIds
    : walletIds
      ? [walletIds]
      : [];
  if (walletId) wallets.push(walletId);
  wallets = Array.from(new Set(wallets.filter(Boolean)));

  const parsedPage = parseInt(page ?? '1', 10);
  const parsedSize = parseInt(pageSize ?? '10', 10);

  // If there's a search query, use the RPC function for customer name search
  if (q) {
    const userIdsArray = userIds
      ? Array.isArray(userIds)
        ? userIds
        : [userIds]
      : [];

    const { data: searchResults, error: rpcError } = await supabase.rpc(
      'search_finance_invoices',
      {
        p_ws_id: wsId,
        p_search_query: q,
        p_start_date: start || null,
        p_end_date: end || null,
        p_user_ids: userIdsArray.length > 0 ? userIdsArray : null,
        p_wallet_ids: wallets.length > 0 ? wallets : null,
        p_limit: parsedSize,
        p_offset: (parsedPage - 1) * parsedSize,
      }
    );

    if (rpcError) throw rpcError;

    // Extract count from first row
    const count = searchResults?.[0]?.total_count || 0;

    // Fetch additional data for legacy/platform creators and wallet info
    const invoiceIds = searchResults.map((r: any) => r.id);
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

    // Merge search results with full invoice data
    const rawData = searchResults.map((searchRow: any) => {
      const fullInvoice = fullInvoices?.find(
        (fi: any) => fi.id === searchRow.id
      );
      return {
        ...searchRow,
        customer: {
          full_name: searchRow.customer_full_name,
          avatar_url: searchRow.customer_avatar_url,
        },
        legacy_creator: fullInvoice?.legacy_creator || null,
        platform_creator: fullInvoice?.platform_creator || null,
        wallet_transactions: fullInvoice?.wallet_transactions || null,
      };
    });

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

  // No search query - use regular query builder
  let selectQuery = `*, customer:workspace_users!customer_id(full_name, avatar_url), legacy_creator:workspace_users!creator_id(id, full_name, display_name, email, avatar_url), platform_creator:users!platform_creator_id(id, display_name, avatar_url, user_private_details(full_name, email))`;

  const walletJoinType = wallets.length > 0 ? '!inner' : '';
  selectQuery += `, wallet_transactions!finance_invoices_transaction_id_fkey${walletJoinType}(wallet:workspace_wallets(name))`;

  let queryBuilder = supabase
    .from('finance_invoices')
    .select(selectQuery, {
      count: 'exact',
    })
    .eq('ws_id', wsId);

  queryBuilder = queryBuilder.order('created_at', { ascending: false });

  if (start && end) {
    queryBuilder = queryBuilder.gte('created_at', start).lte('created_at', end);
  }

  if (userIds) {
    const ids = Array.isArray(userIds) ? userIds : [userIds];
    if (ids.length > 0) {
      queryBuilder = queryBuilder.in('creator_id', ids);
    }
  }

  if (wallets.length > 0) {
    queryBuilder = queryBuilder.in('wallet_transactions.wallet_id', wallets);
  }

  if (page && pageSize) {
    const startRange = (parsedPage - 1) * parsedSize;
    const endRange = parsedPage * parsedSize;
    queryBuilder = queryBuilder.range(startRange, endRange).limit(parsedSize);
  }

  const { data: rawData, error, count } = await queryBuilder;
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
