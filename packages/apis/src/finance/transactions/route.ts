import { canUseRequestedFinanceWalletOnCreate } from '@tuturuuu/utils/finance';
import { getWorkspaceConfig } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import {
  type FinanceRouteAuthContext,
  getFinanceRouteContext,
  hasAnyFinancePermission,
} from '../request-access';
import { enrichTransactionsWithTags } from './tag-enrichment';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

const TransactionSchema = z.object({
  description: z.string().optional(),
  amount: z.number(),
  origin_wallet_id: z.guid(),
  category_id: z.guid().optional(),
  taken_at: z.union([z.string(), z.date()]),
  report_opt_in: z.boolean().optional(),
  tag_ids: z.array(z.guid()).optional(),
  is_amount_confidential: z.boolean().optional(),
  is_description_confidential: z.boolean().optional(),
  is_category_confidential: z.boolean().optional(),
});

type TransactionListRow = {
  category?: string | null;
  category_color?: string | null;
  category_icon?: string | null;
  category_name?: string | null;
  creator_avatar_url?: string | null;
  creator_email?: string | null;
  creator_full_name?: string | null;
  id: string;
  user?: {
    avatar_url?: string | null;
    email?: string | null;
    full_name?: string | null;
  } | null;
  wallet?: string | null;
  wallet_name?: string | null;
};

function normalizeTransactionListRow<TTransaction extends TransactionListRow>(
  transaction: TTransaction
) {
  const hasCreator = Boolean(
    transaction.creator_full_name ||
      transaction.creator_email ||
      transaction.creator_avatar_url
  );

  return {
    ...transaction,
    category: transaction.category ?? transaction.category_name ?? null,
    category_color: transaction.category_color ?? null,
    category_icon: transaction.category_icon ?? null,
    user:
      transaction.user ??
      (hasCreator
        ? {
            avatar_url: transaction.creator_avatar_url ?? null,
            email: transaction.creator_email ?? null,
            full_name: transaction.creator_full_name ?? null,
          }
        : undefined),
    wallet: transaction.wallet ?? transaction.wallet_name ?? null,
  };
}

function normalizeTransactionDate(value: string | Date) {
  const date = typeof value === 'string' ? new Date(value) : value;
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export async function GET(
  req: Request,
  { params }: Params,
  authContext?: FinanceRouteAuthContext
) {
  const { wsId } = await params;
  const access = await getFinanceRouteContext(req, wsId, authContext);

  if (access.response) {
    return access.response;
  }

  const { normalizedWsId, permissions, sbAdmin, supabase, user } =
    access.context;

  if (
    !hasAnyFinancePermission(permissions, [
      'view_transactions',
      'view_expenses',
      'view_incomes',
    ])
  ) {
    return NextResponse.json(
      { message: 'Insufficient permissions' },
      { status: 403 }
    );
  }

  // Parse the request URL
  const url = new URL(req.url);

  // Extract and validate query parameters for pagination
  const pageParam = url.searchParams.get('page');
  const itemsPerPageParam = url.searchParams.get('itemsPerPage');
  const includeCount = url.searchParams.get('includeCount') === 'true';

  const page = Math.max(1, parseInt(pageParam || '1', 10));
  const itemsPerPage = Math.max(1, parseInt(itemsPerPageParam || '25', 10));
  const offset = (page - 1) * itemsPerPage;

  // Use the RPC function with pagination parameters to fetch transactions
  const { data, error } = await supabase.rpc(
    'get_wallet_transactions_with_permissions',
    {
      p_ws_id: normalizedWsId,
      p_user_id: user.id,
      p_transaction_ids: undefined,
      p_limit: itemsPerPage,
      p_offset: offset,
      p_include_count: includeCount || undefined,
    }
  );

  if (error) {
    console.error(error);
    return NextResponse.json(
      { message: 'Error fetching transactions' },
      { status: 500 }
    );
  }

  // The RPC function should ideally handle sorting.
  // If not, sorting here will only sort the current page of results.
  // This preserves existing behavior of sorting the returned data.
  const sortedData = (data ?? []).sort((a, b) => {
    const dateA = new Date(a.taken_at).getTime();
    const dateB = new Date(b.taken_at).getTime();
    return dateB - dateA;
  });

  const { data: enrichedData, error: tagError } =
    await enrichTransactionsWithTags(sbAdmin, sortedData);

  if (tagError) {
    console.error('Error enriching transaction tags:', tagError.message);
    return NextResponse.json(
      { message: 'Error fetching transaction tags' },
      { status: 500 }
    );
  }

  const normalizedData = (enrichedData ?? []).map((transaction) =>
    normalizeTransactionListRow(transaction)
  );

  if (!includeCount) {
    return NextResponse.json(normalizedData);
  }

  const total = Number(
    (sortedData[0] as { total_count?: number })?.total_count ?? 0
  );
  const pageCount = Math.max(1, Math.ceil(total / itemsPerPage));

  return NextResponse.json({
    count: total,
    data: normalizedData,
    pagination: {
      hasNextPage: offset + itemsPerPage < total,
      hasPreviousPage: offset > 0,
      limit: itemsPerPage,
      offset,
      page,
      pageCount,
      pageSize: itemsPerPage,
      total,
    },
  });
}

export async function POST(
  req: Request,
  { params }: Params,
  authContext?: FinanceRouteAuthContext
) {
  const { wsId } = await params;
  const access = await getFinanceRouteContext(req, wsId, authContext);

  if (access.response) {
    return access.response;
  }

  const { normalizedWsId, permissions, sbAdmin, supabase, user } =
    access.context;
  const { withoutPermission } = permissions;

  if (withoutPermission('create_transactions')) {
    return NextResponse.json(
      { message: 'Insufficient permissions' },
      { status: 403 }
    );
  }

  const parsed = TransactionSchema.safeParse(await req.json());

  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid request data', errors: parsed.error.issues },
      { status: 400 }
    );
  }
  const data = parsed.data;
  const tagIds = data.tag_ids;
  delete data.tag_ids;
  const takenAt = normalizeTransactionDate(data.taken_at);

  if (!takenAt) {
    return NextResponse.json(
      { message: 'Invalid transaction date' },
      { status: 400 }
    );
  }

  // Check if any confidential flags are being set
  const hasConfidentialFields =
    data.is_amount_confidential ||
    data.is_description_confidential ||
    data.is_category_confidential;

  // If creating confidential transaction, check permission
  if (
    hasConfidentialFields &&
    withoutPermission('create_confidential_transactions')
  ) {
    return NextResponse.json(
      {
        message: 'Insufficient permissions to create confidential transactions',
      },
      { status: 403 }
    );
  }

  // Ensure wallet is in this workspace
  const { data: walletCheck, error: walletErr } = await sbAdmin
    .from('workspace_wallets')
    .select('id')
    .eq('id', data.origin_wallet_id)
    .eq('ws_id', normalizedWsId)
    .maybeSingle();

  if (walletErr || !walletCheck) {
    return NextResponse.json({ message: 'Invalid wallet' }, { status: 400 });
  }

  const defaultWalletId = await getWorkspaceConfig(
    normalizedWsId,
    'default_wallet_id'
  );

  if (
    !canUseRequestedFinanceWalletOnCreate({
      permissions,
      defaultWalletId,
      requestedWalletId: data.origin_wallet_id,
    })
  ) {
    return NextResponse.json(
      {
        message:
          'Insufficient permissions to override the default wallet for new transactions',
      },
      { status: 403 }
    );
  }

  let { data: wsUser } = await supabase
    .from('workspace_user_linked_users')
    .select('virtual_user_id')
    .eq('platform_user_id', user.id)
    .eq('ws_id', normalizedWsId)
    .maybeSingle();

  if (!wsUser?.virtual_user_id) {
    try {
      const { data: repairedVirtualUserId, error: repairError } =
        await sbAdmin.rpc('ensure_workspace_user_link', {
          target_user_id: user.id,
          target_ws_id: normalizedWsId,
        });

      if (!repairError) {
        const { data: repairedUser } = await supabase
          .from('workspace_user_linked_users')
          .select('virtual_user_id')
          .eq('platform_user_id', user.id)
          .eq('ws_id', normalizedWsId)
          .maybeSingle();

        wsUser =
          repairedUser ??
          (typeof repairedVirtualUserId === 'string'
            ? { virtual_user_id: repairedVirtualUserId }
            : null);
      }
    } catch {
      wsUser = null;
    }
  }

  const { data: transaction, error } = await sbAdmin
    .from('wallet_transactions')
    .insert({
      amount: data.amount,
      description: data.description,
      wallet_id: data.origin_wallet_id,
      category_id: data.category_id || null,
      taken_at: takenAt,
      report_opt_in: data.report_opt_in || false,
      creator_id: wsUser?.virtual_user_id ?? null,
      platform_creator_id: user.id,
      is_amount_confidential: data.is_amount_confidential || false,
      is_description_confidential: data.is_description_confidential || false,
      is_category_confidential: data.is_category_confidential || false,
    })
    .select('id')
    .single();

  if (error) {
    console.error(error);
    return NextResponse.json(
      { message: 'Error creating transaction' },
      { status: 500 }
    );
  }

  // Handle tags if provided
  if (tagIds && tagIds.length > 0 && transaction?.id) {
    const tagInserts = tagIds.map((tagId: string) => ({
      transaction_id: transaction.id,
      tag_id: tagId,
    }));

    const { error: tagError } = await sbAdmin
      .from('wallet_transaction_tags')
      .insert(tagInserts);

    if (tagError) {
      console.error(tagError);
      // Don't fail the entire transaction if tags fail
    }
  }

  return NextResponse.json({
    message: 'success',
    transaction_id: transaction.id,
  });
}
