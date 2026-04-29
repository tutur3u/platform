import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import {
  getPermissions,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';

type WalletPermission =
  | 'view_transactions'
  | 'update_wallets'
  | 'delete_wallets'
  | 'create_wallets'
  | 'create_transactions'
  | 'update_transactions'
  | 'manage_finance';

// These clients are only threaded through helper responses for route-local use.
// Keeping them broad avoids leaking complex generated Supabase generics here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WalletSupabaseClient = any;

type WalletRouteContext = {
  normalizedWsId: string;
  requiredPermission: WalletPermission;
  sbAdmin: WalletSupabaseClient;
  supabase: WalletSupabaseClient;
  userId: string;
};

type WalletContextResult =
  | { context: WalletRouteContext; response?: never }
  | { context?: never; response: NextResponse };

type AccessibleWalletResult =
  | {
      context: WalletRouteContext;
      wallet: Record<string, unknown>;
      response?: never;
    }
  | { context?: never; wallet?: never; response: NextResponse };

export function flattenWalletCreditData<T extends Record<string, unknown>>(
  wallet: T
) {
  const { credit_wallets, ...walletBase } = wallet as T & {
    credit_wallets?: {
      limit: number;
      statement_date: number;
      payment_date: number;
    } | null;
  };

  return {
    ...walletBase,
    ...(credit_wallets
      ? {
          limit: credit_wallets.limit,
          statement_date: credit_wallets.statement_date,
          payment_date: credit_wallets.payment_date,
        }
      : {}),
  };
}

export function flattenWalletCreditList<T extends Record<string, unknown>>(
  wallets: T[]
) {
  return wallets.map((wallet) => flattenWalletCreditData(wallet));
}

export async function getWalletRouteContext(
  req: Request,
  wsId: string,
  requiredPermission: WalletPermission
): Promise<WalletContextResult> {
  const supabase = await createClient(req);
  const { user, authError } = await resolveAuthenticatedSessionUser(supabase);

  if (authError || !user) {
    return {
      response: NextResponse.json({ message: 'Unauthorized' }, { status: 401 }),
    };
  }

  let normalizedWsId: string;
  try {
    normalizedWsId = await normalizeWorkspaceId(wsId, supabase);
  } catch {
    return {
      response: NextResponse.json({ message: 'Unauthorized' }, { status: 401 }),
    };
  }

  const permissions = await getPermissions({ wsId, request: req });

  if (!permissions || permissions.withoutPermission(requiredPermission)) {
    return {
      response: NextResponse.json(
        { message: 'Insufficient permissions' },
        { status: 403 }
      ),
    };
  }

  return {
    context: {
      normalizedWsId,
      requiredPermission,
      sbAdmin: (await createAdminClient()) as WalletSupabaseClient,
      supabase: supabase as WalletSupabaseClient,
      userId: user.id,
    },
  };
}

export async function getAccessibleWallet({
  req,
  wsId,
  walletId,
  requiredPermission,
  select,
}: {
  req: Request;
  wsId: string;
  walletId: string;
  requiredPermission: WalletPermission;
  select: string;
}): Promise<AccessibleWalletResult> {
  const contextResult = await getWalletRouteContext(
    req,
    wsId,
    requiredPermission
  );

  if (contextResult.response) {
    return contextResult;
  }

  const { context } = contextResult;

  const permissions = await getPermissions({ wsId, request: req });
  const hasManageFinance =
    !!permissions && !permissions.withoutPermission('manage_finance');

  if (!hasManageFinance) {
    const { data: memberships, error: membershipsError } = await context.sbAdmin
      .from('workspace_role_members')
      .select('role_id, workspace_roles!inner(ws_id)')
      .eq('user_id', context.userId)
      .eq('workspace_roles.ws_id', context.normalizedWsId);

    if (membershipsError) {
      console.error('Error fetching wallet role memberships', membershipsError);
      return {
        response: NextResponse.json(
          { message: 'Error fetching wallet access' },
          { status: 500 }
        ),
      };
    }

    const roleIds = ((memberships ?? []) as Array<{ role_id: string }>).map(
      (membership) => membership.role_id
    );

    if (roleIds.length === 0) {
      return {
        response: NextResponse.json(
          { message: 'Wallet not found' },
          { status: 404 }
        ),
      };
    }

    const { data: whitelistRows, error: whitelistError } = await context.sbAdmin
      .from('workspace_role_wallet_whitelist')
      .select('wallet_id')
      .eq('wallet_id', walletId)
      .in('role_id', roleIds);

    if (whitelistError) {
      console.error('Error fetching wallet whitelist', whitelistError);
      return {
        response: NextResponse.json(
          { message: 'Error fetching wallet access' },
          { status: 500 }
        ),
      };
    }

    if (!whitelistRows?.length) {
      return {
        response: NextResponse.json(
          { message: 'Wallet not found' },
          { status: 404 }
        ),
      };
    }
  }

  const { data: wallet, error: walletError } = await context.sbAdmin
    .from('workspace_wallets')
    .select(select)
    .eq('id', walletId)
    .eq('ws_id', context.normalizedWsId)
    .maybeSingle();

  if (walletError) {
    console.error('Error fetching workspace wallet', walletError);
    return {
      response: NextResponse.json(
        { message: 'Error fetching workspace wallets' },
        { status: 500 }
      ),
    };
  }

  if (!wallet) {
    return {
      response: NextResponse.json(
        { message: 'Wallet not found' },
        { status: 404 }
      ),
    };
  }

  return {
    context,
    wallet: wallet as Record<string, unknown>,
  };
}

export async function getAccessibleWallets({
  req,
  wsId,
  walletIds,
  requiredPermission,
  select,
}: {
  req: Request;
  wsId: string;
  walletIds: string[];
  requiredPermission: WalletPermission;
  select: string;
}): Promise<
  | {
      context: WalletRouteContext;
      wallets: Array<Record<string, unknown>>;
      response?: never;
    }
  | { context?: never; wallets?: never; response: NextResponse }
> {
  const uniqueWalletIds = [...new Set(walletIds)];
  const contextResult = await getWalletRouteContext(
    req,
    wsId,
    requiredPermission
  );

  if (contextResult.response) {
    return contextResult;
  }

  if (uniqueWalletIds.length === 0) {
    return {
      context: contextResult.context,
      wallets: [],
    };
  }

  const permissions = await getPermissions({ wsId, request: req });
  const hasManageFinance =
    !!permissions && !permissions.withoutPermission('manage_finance');

  let allowedWalletIds = uniqueWalletIds;

  if (!hasManageFinance) {
    const { data: memberships, error: membershipsError } =
      await contextResult.context.sbAdmin
        .from('workspace_role_members')
        .select('role_id, workspace_roles!inner(ws_id)')
        .eq('user_id', contextResult.context.userId)
        .eq('workspace_roles.ws_id', contextResult.context.normalizedWsId);

    if (membershipsError) {
      console.error('Error fetching wallet role memberships', membershipsError);
      return {
        response: NextResponse.json(
          { message: 'Error fetching wallet access' },
          { status: 500 }
        ),
      };
    }

    const roleIds = ((memberships ?? []) as Array<{ role_id: string }>).map(
      (membership) => membership.role_id
    );

    if (roleIds.length === 0) {
      return {
        context: contextResult.context,
        wallets: [],
      };
    }

    const { data: whitelistRows, error: whitelistError } =
      await contextResult.context.sbAdmin
        .from('workspace_role_wallet_whitelist')
        .select('wallet_id')
        .in('wallet_id', uniqueWalletIds)
        .in('role_id', roleIds);

    if (whitelistError) {
      console.error('Error fetching wallet whitelist', whitelistError);
      return {
        response: NextResponse.json(
          { message: 'Error fetching wallet access' },
          { status: 500 }
        ),
      };
    }

    allowedWalletIds = [
      ...new Set(
        ((whitelistRows ?? []) as Array<{ wallet_id: string }>).map(
          (row) => row.wallet_id
        )
      ),
    ];
  }

  if (allowedWalletIds.length === 0) {
    return {
      context: contextResult.context,
      wallets: [],
    };
  }

  const { data: wallets, error: walletsError } =
    await contextResult.context.sbAdmin
      .from('workspace_wallets')
      .select(select)
      .eq('ws_id', contextResult.context.normalizedWsId)
      .in('id', allowedWalletIds);

  if (walletsError) {
    console.error('Error fetching workspace wallets', walletsError);
    return {
      response: NextResponse.json(
        { message: 'Error fetching workspace wallets' },
        { status: 500 }
      ),
    };
  }

  return {
    context: contextResult.context,
    wallets: (wallets ?? []) as Array<Record<string, unknown>>,
  };
}
