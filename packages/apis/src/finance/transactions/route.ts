import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { resolveWorkspaceId } from '@tuturuuu/utils/constants';
import { canUseRequestedFinanceWalletOnCreate } from '@tuturuuu/utils/finance';
import {
  getPermissions,
  getWorkspaceConfig,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';

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
export async function GET(req: Request, { params }: Params) {
  const { wsId } = await params;
  const sbAdmin = await createAdminClient();

  const permissions = await getPermissions({
    wsId,
    request: req,
  });

  if (!permissions) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const { withoutPermission } = permissions;

  if (
    withoutPermission('view_transactions') &&
    withoutPermission('view_expenses') &&
    withoutPermission('view_incomes')
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

  const page = Math.max(1, parseInt(pageParam || '1', 10));
  const itemsPerPage = Math.max(1, parseInt(itemsPerPageParam || '25', 10));
  const offset = (page - 1) * itemsPerPage;

  const supabase = await createClient(req);

  // Get authenticated user for permission checks
  const { user } = await resolveAuthenticatedSessionUser(supabase);

  if (!user) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  // Use the RPC function with pagination parameters to fetch transactions
  const { data, error } = await supabase.rpc(
    'get_wallet_transactions_with_permissions',
    {
      p_ws_id: wsId,
      p_user_id: user.id,
      p_transaction_ids: undefined,
      p_limit: itemsPerPage,
      p_offset: offset,
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

  return NextResponse.json(enrichedData ?? []);
}

export async function POST(req: Request, { params }: Params) {
  const { wsId } = await params;

  const permissions = await getPermissions({
    wsId,
    request: req,
  });

  if (!permissions) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const { withoutPermission } = permissions;

  if (withoutPermission('create_transactions')) {
    return NextResponse.json(
      { message: 'Insufficient permissions' },
      { status: 403 }
    );
  }

  const supabase = await createClient(req);
  const sbAdmin = await createAdminClient();

  // Get authenticated user
  const { user } = await resolveAuthenticatedSessionUser(supabase);

  if (!user) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  // Resolve workspace ID (handles "internal" slug)
  const resolvedWsId = resolveWorkspaceId(wsId);
  const defaultWalletId = await getWorkspaceConfig(wsId, 'default_wallet_id');

  // Get the virtual_user_id for this workspace
  let { data: wsUser } = await supabase
    .from('workspace_user_linked_users')
    .select('virtual_user_id')
    .eq('platform_user_id', user.id)
    .eq('ws_id', resolvedWsId)
    .single();

  // If not found, try to auto-repair the link
  if (!wsUser?.virtual_user_id) {
    // Check if user is a workspace member first
    const membership = await verifyWorkspaceMembershipType({
      wsId: resolvedWsId,
      userId: user.id,
      supabase,
    });

    if (!membership.ok) {
      return NextResponse.json(
        { message: 'User is not a member of this workspace' },
        { status: 403 }
      );
    }

    // Try to repair the link using admin client
    try {
      const sbAdmin = await createAdminClient();
      await sbAdmin.rpc('ensure_workspace_user_link', {
        target_user_id: user.id,
        target_ws_id: resolvedWsId,
      });

      // Fetch the newly created link
      const { data: repairedUser } = await supabase
        .from('workspace_user_linked_users')
        .select('virtual_user_id')
        .eq('platform_user_id', user.id)
        .eq('ws_id', resolvedWsId)
        .single();

      wsUser = repairedUser;
    } catch (repairError) {
      console.error('Failed to auto-repair workspace user link:', repairError);
    }
  }

  if (!wsUser?.virtual_user_id) {
    return NextResponse.json(
      { message: 'User not found in workspace' },
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
    .eq('ws_id', resolvedWsId)
    .maybeSingle();

  if (walletErr || !walletCheck) {
    return NextResponse.json({ message: 'Invalid wallet' }, { status: 400 });
  }

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

  const { data: transaction, error } = await sbAdmin
    .from('wallet_transactions')
    .insert({
      amount: data.amount,
      description: data.description,
      wallet_id: data.origin_wallet_id,
      category_id: data.category_id || null,
      taken_at:
        typeof data.taken_at === 'string'
          ? new Date(data.taken_at).toISOString()
          : data.taken_at.toISOString(),
      report_opt_in: data.report_opt_in || false,
      creator_id: wsUser.virtual_user_id,
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

  return NextResponse.json({ message: 'success' });
}
