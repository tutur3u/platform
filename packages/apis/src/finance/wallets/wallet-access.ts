import { NextResponse } from 'next/server';
import {
  type FinanceRouteAuthContext,
  type FinanceRouteContext,
  getFinanceRouteContext,
} from '../request-access';

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
  permissions: FinanceRouteContext['permissions'];
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

type WalletCreditRow = {
  limit: number;
  payment_date: number;
  statement_date: number;
  wallet_id: string;
};

const CREDIT_WALLET_RELATION_SELECT =
  'credit_wallets(limit, statement_date, payment_date)';

export function selectIncludesWalletCreditData(select: string) {
  return select.includes('credit_wallets(');
}

export function stripWalletCreditSelect(select: string) {
  if (!selectIncludesWalletCreditData(select)) {
    return select;
  }

  const stripped = select
    .replace(
      /,\s*credit_wallets\(limit,\s*statement_date,\s*payment_date\)/u,
      ''
    )
    .replace(
      /credit_wallets\(limit,\s*statement_date,\s*payment_date\),\s*/u,
      ''
    )
    .replace(CREDIT_WALLET_RELATION_SELECT, '')
    .trim();

  return stripped.length > 0 ? stripped : '*';
}

export async function attachWalletCreditData<T extends Record<string, unknown>>(
  sbAdmin: WalletSupabaseClient,
  wallets: T[]
): Promise<{ data: T[]; error: unknown | null }> {
  const walletIds = [
    ...new Set(
      wallets
        .map((wallet) => wallet.id)
        .filter((id): id is string => typeof id === 'string')
    ),
  ];

  if (walletIds.length === 0) {
    return { data: wallets, error: null };
  }

  const { data: creditRows, error } = await sbAdmin
    .from('credit_wallets')
    .select('wallet_id, limit, statement_date, payment_date')
    .in('wallet_id', walletIds);

  if (error) {
    return { data: wallets, error };
  }

  const creditByWalletId = new Map(
    ((creditRows ?? []) as WalletCreditRow[]).map((row) => [
      row.wallet_id,
      {
        limit: row.limit,
        payment_date: row.payment_date,
        statement_date: row.statement_date,
      },
    ])
  );

  return {
    data: wallets.map((wallet) => ({
      ...wallet,
      credit_wallets:
        typeof wallet.id === 'string'
          ? (creditByWalletId.get(wallet.id) ?? null)
          : null,
    })),
    error: null,
  };
}

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
  requiredPermission: WalletPermission,
  authContext?: FinanceRouteAuthContext
): Promise<WalletContextResult> {
  const financeContext = await getFinanceRouteContext(req, wsId, authContext);

  if (financeContext.response) {
    return financeContext;
  }

  const { context } = financeContext;

  if (context.permissions.withoutPermission(requiredPermission)) {
    return {
      response: NextResponse.json(
        { message: 'Insufficient permissions' },
        { status: 403 }
      ),
    };
  }

  return {
    context: {
      normalizedWsId: context.normalizedWsId,
      permissions: context.permissions,
      requiredPermission,
      sbAdmin: context.sbAdmin as WalletSupabaseClient,
      supabase: context.supabase as WalletSupabaseClient,
      userId: context.user.id,
    },
  };
}

export async function getAccessibleWallet({
  req,
  wsId,
  walletId,
  requiredPermission,
  select,
  authContext,
}: {
  req: Request;
  wsId: string;
  walletId: string;
  requiredPermission: WalletPermission;
  select: string;
  authContext?: FinanceRouteAuthContext;
}): Promise<AccessibleWalletResult> {
  const contextResult = await getWalletRouteContext(
    req,
    wsId,
    requiredPermission,
    authContext
  );

  if (contextResult.response) {
    return contextResult;
  }

  const { context } = contextResult;

  const hasManageFinance =
    !context.permissions.withoutPermission('manage_finance');
  const shouldAttachCreditData = selectIncludesWalletCreditData(select);
  const walletSelect = stripWalletCreditSelect(select);

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
    .schema('private')
    .from('workspace_wallets')
    .select(walletSelect)
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

  if (shouldAttachCreditData) {
    const { data: walletsWithCreditData, error: creditWalletError } =
      await attachWalletCreditData(context.sbAdmin, [
        wallet as Record<string, unknown>,
      ]);

    if (creditWalletError) {
      console.error('Error fetching wallet credit data', creditWalletError);
      return {
        response: NextResponse.json(
          { message: 'Error fetching workspace wallets' },
          { status: 500 }
        ),
      };
    }

    return {
      context,
      wallet: walletsWithCreditData[0] ?? (wallet as Record<string, unknown>),
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

  const hasManageFinance =
    !contextResult.context.permissions.withoutPermission('manage_finance');

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

  const shouldAttachCreditData = selectIncludesWalletCreditData(select);
  const walletSelect = stripWalletCreditSelect(select);

  const { data: wallets, error: walletsError } =
    await contextResult.context.sbAdmin
      .schema('private')
      .from('workspace_wallets')
      .select(walletSelect)
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

  if (shouldAttachCreditData) {
    const { data: walletsWithCreditData, error: creditWalletError } =
      await attachWalletCreditData(
        contextResult.context.sbAdmin,
        (wallets ?? []) as Array<Record<string, unknown>>
      );

    if (creditWalletError) {
      console.error('Error fetching wallet credit data', creditWalletError);
      return {
        response: NextResponse.json(
          { message: 'Error fetching workspace wallets' },
          { status: 500 }
        ),
      };
    }

    return {
      context: contextResult.context,
      wallets: walletsWithCreditData,
    };
  }

  return {
    context: contextResult.context,
    wallets: (wallets ?? []) as Array<Record<string, unknown>>,
  };
}
