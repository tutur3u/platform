import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import { resolveSupportedCurrency } from '@tuturuuu/utils/currencies';
import {
  getPermissions,
  getWorkspace,
  getWorkspaceConfig,
  type PermissionsResult,
} from '@tuturuuu/utils/workspace-helper';

export type FinanceWorkspace = NonNullable<
  Awaited<ReturnType<typeof getWorkspace>>
>;

export interface FinanceWorkspaceContext {
  currency: string;
  invoiceDefaults: {
    defaultCategoryId: string | null;
    defaultSubscriptionCategoryId: string | null;
    defaultWalletId: string | null;
  };
  permissions: PermissionsResult;
  timezone: string | null;
  user: {
    displayName?: string | null;
    email?: string | null;
    id: string;
  };
  workspace: FinanceWorkspace;
  wsId: string;
}

function normalizeConfigValue(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed || null;
}

export async function getFinanceWorkspace(id: string) {
  const user = await getSatelliteAppSessionUser('finance');

  if (!user?.id) {
    return null;
  }

  return getWorkspace(id, { useAdmin: true, user });
}

export async function getFinanceWorkspacePermissions(id: string) {
  const user = await getSatelliteAppSessionUser('finance');

  if (!user?.id) {
    return null;
  }

  return getPermissions({ user, wsId: id });
}

export async function getFinanceWorkspaceContext(
  id: string
): Promise<FinanceWorkspaceContext | null> {
  const user = await getSatelliteAppSessionUser('finance');

  if (!user?.id) {
    return null;
  }

  const workspace = await getWorkspace(id, { useAdmin: true, user });

  if (!workspace) {
    return null;
  }

  const [
    permissions,
    currency,
    defaultWalletId,
    defaultCategoryId,
    defaultSubscriptionCategoryId,
  ] = await Promise.all([
    getPermissions({ user, wsId: workspace.id }),
    getWorkspaceConfig(workspace.id, 'DEFAULT_CURRENCY'),
    getWorkspaceConfig(workspace.id, 'default_wallet_id'),
    getWorkspaceConfig(workspace.id, 'default_category_id'),
    getWorkspaceConfig(workspace.id, 'DEFAULT_SUBSCRIPTION_CATEGORY_ID'),
  ]);

  if (!permissions) {
    return null;
  }
  const financeUser = user as typeof user & {
    displayName?: string | null;
    display_name?: string | null;
  };

  return {
    currency: resolveSupportedCurrency(currency),
    invoiceDefaults: {
      defaultCategoryId: normalizeConfigValue(defaultCategoryId),
      defaultSubscriptionCategoryId: normalizeConfigValue(
        defaultSubscriptionCategoryId
      ),
      defaultWalletId: normalizeConfigValue(defaultWalletId),
    },
    permissions,
    timezone: normalizeConfigValue(workspace.timezone),
    user: {
      displayName:
        financeUser.displayName ??
        financeUser.display_name ??
        user.email ??
        user.id,
      email: user.email ?? null,
      id: user.id,
    },
    workspace,
    wsId: workspace.id,
  };
}
