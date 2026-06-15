import { normalizeSummaryWallet } from './helpers';
import type {
  WalletCheckpointAuditStatus,
  WalletCheckpointInterval,
  WalletCheckpointRow,
  WalletCheckpointSummaryWallet,
} from './types';

export type CheckpointWalletContext = {
  normalizedWsId: string;
  permissions?: {
    withoutPermission: (permission: 'manage_finance') => boolean;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sbAdmin: any;
  userId: string;
};

type WalletWhitelistWindowRow = {
  custom_days: number | null;
  viewing_window: string | null;
  wallet_id: string;
};

export type CheckpointWalletAccess = {
  wallets: WalletCheckpointSummaryWallet[];
  windowStartsByWalletId: Map<string, string>;
};

const VIEWING_WINDOW_DAYS: Record<string, number> = {
  '1_day': 1,
  '3_days': 3,
  '7_days': 7,
  '2_weeks': 14,
  '1_month': 30,
  '1_quarter': 90,
  '1_year': 365,
};

export function getWalletViewingWindowDays(
  viewingWindow: string | null | undefined,
  customDays: number | null | undefined
) {
  if (viewingWindow === 'custom') {
    return typeof customDays === 'number' && customDays >= 1 ? customDays : 30;
  }

  return viewingWindow ? (VIEWING_WINDOW_DAYS[viewingWindow] ?? 30) : 30;
}

export function getCheckpointWindowStart({
  customDays,
  now = new Date(),
  viewingWindow,
}: {
  customDays: number | null | undefined;
  now?: Date;
  viewingWindow: string | null | undefined;
}) {
  const windowDays = getWalletViewingWindowDays(viewingWindow, customDays);
  return new Date(
    now.getTime() - windowDays * 24 * 60 * 60 * 1000
  ).toISOString();
}

export function buildCheckpointWindowStarts(
  rows: WalletWhitelistWindowRow[],
  now = new Date()
) {
  const widestWindowByWalletId = new Map<
    string,
    { customDays: number | null; days: number; viewingWindow: string | null }
  >();

  for (const row of rows) {
    const days = getWalletViewingWindowDays(
      row.viewing_window,
      row.custom_days
    );
    const existing = widestWindowByWalletId.get(row.wallet_id);

    if (!existing || days > existing.days) {
      widestWindowByWalletId.set(row.wallet_id, {
        customDays: row.custom_days,
        days,
        viewingWindow: row.viewing_window,
      });
    }
  }

  return new Map(
    [...widestWindowByWalletId.entries()].map(([walletId, window]) => [
      walletId,
      getCheckpointWindowStart({
        customDays: window.customDays,
        now,
        viewingWindow: window.viewingWindow,
      }),
    ])
  );
}

export function getOldestCheckpointWindowStart(
  windowStartsByWalletId: Map<string, string>
) {
  let oldestStart: string | undefined;
  let oldestTime = Number.POSITIVE_INFINITY;

  for (const windowStart of windowStartsByWalletId.values()) {
    const windowTime = Date.parse(windowStart);

    if (Number.isFinite(windowTime) && windowTime < oldestTime) {
      oldestTime = windowTime;
      oldestStart = windowStart;
    }
  }

  return oldestStart;
}

function isAtOrAfterWindowStart(checkedAt: string, windowStart: string) {
  const checkedAtTime = Date.parse(checkedAt);
  const windowStartTime = Date.parse(windowStart);

  return (
    Number.isFinite(checkedAtTime) &&
    Number.isFinite(windowStartTime) &&
    checkedAtTime >= windowStartTime
  );
}

export function isCheckpointVisibleForWallet({
  checkedAt,
  walletId,
  windowStartsByWalletId,
}: {
  checkedAt: string;
  walletId: string;
  windowStartsByWalletId: Map<string, string>;
}) {
  const windowStart = windowStartsByWalletId.get(walletId);

  if (!windowStart) {
    return true;
  }

  return isAtOrAfterWindowStart(checkedAt, windowStart);
}

export function filterCheckpointRowsByWindow<T extends WalletCheckpointRow>(
  rows: T[],
  windowStartsByWalletId: Map<string, string>
) {
  if (windowStartsByWalletId.size === 0) {
    return rows;
  }

  return rows.filter((row) =>
    isCheckpointVisibleForWallet({
      checkedAt: row.checked_at,
      walletId: row.wallet_id,
      windowStartsByWalletId,
    })
  );
}

export function filterCheckpointIntervalsByWindow<
  T extends WalletCheckpointInterval,
>(
  intervals: T[],
  walletId: string,
  windowStartsByWalletId: Map<string, string>
) {
  const windowStart = windowStartsByWalletId.get(walletId);

  if (!windowStart) {
    return intervals;
  }

  return intervals.filter(
    (interval) =>
      isAtOrAfterWindowStart(interval.start_checked_at, windowStart) &&
      isAtOrAfterWindowStart(interval.end_checked_at, windowStart)
  );
}

export function sanitizeAuditStatusesByWindow(
  auditStatuses: WalletCheckpointAuditStatus[],
  windowStartsByWalletId: Map<string, string>
) {
  if (windowStartsByWalletId.size === 0) {
    return auditStatuses;
  }

  return auditStatuses.map((status) => {
    if (
      !status.latest_checked_at ||
      isCheckpointVisibleForWallet({
        checkedAt: status.latest_checked_at,
        walletId: status.wallet_id,
        windowStartsByWalletId,
      })
    ) {
      return status;
    }

    return {
      ...status,
      audited_balance: status.ledger_balance,
      checkpoint_ledger_balance: null,
      latest_actual_balance: null,
      latest_checked_at: null,
      latest_checkpoint_id: null,
      post_checkpoint_delta: 0,
      post_checkpoint_transaction_count: 0,
      status: 'no_checkpoint' as const,
      variance: 0,
    };
  });
}

export async function listAccessibleCheckpointWallets(
  context: CheckpointWalletContext
): Promise<CheckpointWalletAccess> {
  const hasManageFinance =
    !context.permissions?.withoutPermission('manage_finance');

  let walletIds: string[] | undefined;
  let windowStartsByWalletId = new Map<string, string>();

  if (!hasManageFinance) {
    const { data: memberships, error: membershipsError } = await context.sbAdmin
      .from('workspace_role_members')
      .select('role_id, workspace_roles!inner(ws_id)')
      .eq('user_id', context.userId)
      .eq('workspace_roles.ws_id', context.normalizedWsId);

    if (membershipsError) {
      throw membershipsError;
    }

    const roleIds = ((memberships ?? []) as Array<{ role_id: string }>).map(
      (membership) => membership.role_id
    );

    if (roleIds.length === 0) {
      return { wallets: [], windowStartsByWalletId };
    }

    const { data: whitelistRows, error: whitelistError } = await context.sbAdmin
      .from('workspace_role_wallet_whitelist')
      .select('wallet_id, viewing_window, custom_days')
      .in('role_id', roleIds);

    if (whitelistError) {
      throw whitelistError;
    }

    windowStartsByWalletId = buildCheckpointWindowStarts(
      (whitelistRows ?? []) as WalletWhitelistWindowRow[]
    );
    walletIds = [
      ...new Set(
        ((whitelistRows ?? []) as WalletWhitelistWindowRow[]).map(
          (row) => row.wallet_id
        )
      ),
    ];

    if (walletIds.length === 0) {
      return { wallets: [], windowStartsByWalletId };
    }
  }

  let query = context.sbAdmin
    .schema('private')
    .from('workspace_wallets')
    .select('id,name,currency,balance,type,icon,image_src')
    .eq('ws_id', context.normalizedWsId);

  if (walletIds) {
    query = query.in('id', walletIds);
  }

  const { data, error } = await query.order('name', { ascending: true });

  if (error) {
    throw error;
  }

  return {
    wallets: ((data ?? []) as Array<Record<string, unknown>>).map(
      normalizeSummaryWallet
    ),
    windowStartsByWalletId,
  };
}

export async function getAccessibleCheckpointWindowStart(
  context: CheckpointWalletContext,
  walletId: string
) {
  const hasManageFinance =
    !context.permissions?.withoutPermission('manage_finance');

  if (hasManageFinance) {
    return undefined;
  }

  const { data: memberships, error: membershipsError } = await context.sbAdmin
    .from('workspace_role_members')
    .select('role_id, workspace_roles!inner(ws_id)')
    .eq('user_id', context.userId)
    .eq('workspace_roles.ws_id', context.normalizedWsId);

  if (membershipsError) {
    throw membershipsError;
  }

  const roleIds = ((memberships ?? []) as Array<{ role_id: string }>).map(
    (membership) => membership.role_id
  );

  if (roleIds.length === 0) {
    return getCheckpointWindowStart({
      customDays: null,
      viewingWindow: null,
    });
  }

  const { data: whitelistRows, error: whitelistError } = await context.sbAdmin
    .from('workspace_role_wallet_whitelist')
    .select('wallet_id, viewing_window, custom_days')
    .eq('wallet_id', walletId)
    .in('role_id', roleIds);

  if (whitelistError) {
    throw whitelistError;
  }

  const windowStartsByWalletId = buildCheckpointWindowStarts(
    (whitelistRows ?? []) as WalletWhitelistWindowRow[]
  );

  return (
    windowStartsByWalletId.get(walletId) ??
    getCheckpointWindowStart({
      customDays: null,
      viewingWindow: null,
    })
  );
}
