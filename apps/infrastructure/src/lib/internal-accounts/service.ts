import type {
  InternalAccount,
  InternalAccountAction,
  InternalAccountSortBy,
  InternalAccountSortDirection,
} from '@tuturuuu/internal-api/infrastructure';
import type { SupabaseUser } from '@tuturuuu/supabase/next/user';
import type { SupabaseClient } from '@tuturuuu/supabase/types';
import type { Database } from '@tuturuuu/types';
import { isExactTuturuuuDotComEmail } from '@tuturuuu/utils/email/client';
import { InternalAccountAdminError } from './errors';
import { updateInternalAccountProfile } from './profile-service';

export { InternalAccountAdminError } from './errors';

type AdminClient = SupabaseClient<Database>;

const AUTH_USERS_PAGE_SIZE = 1000;
const MAX_AUTH_USER_PAGES = 10;
const PROFILE_BATCH_SIZE = 100;
const DISABLE_DURATION = '876000h';

function getAuthDisplayName(user: SupabaseUser): string | null {
  const metadata = user.user_metadata;
  const candidates = [
    metadata?.display_name,
    metadata?.full_name,
    metadata?.name,
  ];

  for (const value of candidates) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }

  return null;
}

export function isAccountDisabled(bannedUntil?: string | null) {
  if (!bannedUntil) return false;
  const timestamp = Date.parse(bannedUntil);
  return Number.isFinite(timestamp) && timestamp > Date.now();
}

export function toInternalAccount(
  user: SupabaseUser,
  actorUserId: string
): InternalAccount | null {
  const email = user.email?.trim().toLowerCase();
  if (!email || !isExactTuturuuuDotComEmail(email)) return null;

  return {
    bannedUntil: user.banned_until ?? null,
    createdAt: user.created_at,
    displayName: getAuthDisplayName(user),
    email,
    emailConfirmedAt: user.email_confirmed_at ?? null,
    id: user.id,
    isDisabled: isAccountDisabled(user.banned_until),
    isSelf: user.id === actorUserId,
    lastSignInAt: user.last_sign_in_at ?? null,
    personalWorkspaceId: null,
    storageLimitBytes: null,
    storageUsedBytes: null,
    username: null,
  };
}

async function loadAuthUsers(sbAdmin: AdminClient) {
  const authUsers: SupabaseUser[] = [];
  let page = 1;

  while (page <= MAX_AUTH_USER_PAGES) {
    const { data, error } = await sbAdmin.auth.admin.listUsers({
      page,
      perPage: AUTH_USERS_PAGE_SIZE,
    });

    if (error) {
      console.error('Failed to list internal auth accounts', {
        code: error.code,
        page,
      });
      throw new InternalAccountAdminError(
        'Unable to load internal accounts',
        500
      );
    }

    authUsers.push(...data.users);
    if (!data.nextPage) return authUsers;
    page = data.nextPage;
  }

  console.error('Internal account listing exceeded the safety page budget');
  throw new InternalAccountAdminError('Unable to load internal accounts', 500);
}

async function enrichPublicProfiles(
  accounts: InternalAccount[],
  sbAdmin: AdminClient
) {
  const profiles = new Map<
    string,
    { display_name: string | null; handle: string | null }
  >();

  for (let index = 0; index < accounts.length; index += PROFILE_BATCH_SIZE) {
    const ids = accounts
      .slice(index, index + PROFILE_BATCH_SIZE)
      .map((account) => account.id);
    const { data, error } = await sbAdmin
      .from('users')
      .select('id, display_name, handle')
      .in('id', ids);

    if (error) {
      console.error('Failed to load internal account profiles', {
        code: error.code,
      });
      throw new InternalAccountAdminError(
        'Unable to load internal accounts',
        500
      );
    }

    for (const profile of data ?? []) profiles.set(profile.id, profile);
  }

  return accounts.map((account) => {
    const profile = profiles.get(account.id);
    return {
      ...account,
      displayName: profile?.display_name?.trim() || account.displayName,
      username: profile?.handle?.trim() || null,
    };
  });
}

function compareNullableStrings(
  left: string | null,
  right: string | null,
  direction: InternalAccountSortDirection
) {
  if (left === right) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return left.localeCompare(right) * (direction === 'asc' ? 1 : -1);
}

function sortAccounts(
  accounts: InternalAccount[],
  sortBy: InternalAccountSortBy,
  direction: InternalAccountSortDirection
) {
  return accounts.sort((left, right) => {
    const leftValue =
      sortBy === 'displayName'
        ? left.displayName
        : sortBy === 'createdAt'
          ? left.createdAt
          : sortBy === 'lastSignInAt'
            ? left.lastSignInAt
            : left.email;
    const rightValue =
      sortBy === 'displayName'
        ? right.displayName
        : sortBy === 'createdAt'
          ? right.createdAt
          : sortBy === 'lastSignInAt'
            ? right.lastSignInAt
            : right.email;
    const comparison = compareNullableStrings(leftValue, rightValue, direction);
    return comparison || left.email.localeCompare(right.email);
  });
}

async function enrichStorage(
  accounts: InternalAccount[],
  sbAdmin: AdminClient
) {
  if (accounts.length === 0) return accounts;

  const userIds = accounts.map((account) => account.id);
  const { data: workspaces, error } = await sbAdmin
    .from('workspaces')
    .select('creator_id, id, created_at')
    .eq('personal', true)
    .in('creator_id', userIds)
    .order('created_at', { ascending: true });

  if (error) {
    console.warn('Failed to resolve internal account personal workspaces', {
      code: error.code,
    });
    return accounts;
  }

  const personalWorkspaceByUser = new Map<string, string>();
  for (const workspace of workspaces ?? []) {
    if (!personalWorkspaceByUser.has(workspace.creator_id)) {
      personalWorkspaceByUser.set(workspace.creator_id, workspace.id);
    }
  }

  return Promise.all(
    accounts.map(async (account) => {
      const personalWorkspaceId = personalWorkspaceByUser.get(account.id);
      if (!personalWorkspaceId) return account;

      const [usedResult, limitResult] = await Promise.all([
        sbAdmin.rpc('get_workspace_drive_size', {
          ws_id: personalWorkspaceId,
        }),
        sbAdmin.rpc('get_workspace_storage_limit', {
          p_ws_id: personalWorkspaceId,
        }),
      ]);

      if (usedResult.error || limitResult.error) {
        console.warn('Failed to load internal account storage usage', {
          limitCode: limitResult.error?.code,
          usedCode: usedResult.error?.code,
          userId: account.id,
        });
      }

      return {
        ...account,
        personalWorkspaceId,
        storageLimitBytes:
          typeof limitResult.data === 'number' ? limitResult.data : null,
        storageUsedBytes:
          typeof usedResult.data === 'number' ? usedResult.data : null,
      };
    })
  );
}

export async function listInternalAccountUsers({
  activeOnly = true,
  actorUserId,
  cursor,
  limit = 24,
  q,
  sbAdmin,
  sortBy = 'displayName',
  sortDirection = 'asc',
  verifiedOnly = true,
}: {
  activeOnly?: boolean;
  actorUserId: string;
  cursor?: string;
  limit?: number;
  q?: string;
  sbAdmin: AdminClient;
  sortBy?: InternalAccountSortBy;
  sortDirection?: InternalAccountSortDirection;
  verifiedOnly?: boolean;
}) {
  const authUsers = await loadAuthUsers(sbAdmin);
  const internalAccounts = authUsers
    .map((user) => toInternalAccount(user, actorUserId))
    .filter((account): account is InternalAccount => account !== null);
  const accountsWithProfiles = await enrichPublicProfiles(
    internalAccounts,
    sbAdmin
  );
  const normalizedQuery = q?.trim().toLowerCase();
  const filteredAccounts = accountsWithProfiles.filter(
    (account) =>
      (!activeOnly || !account.isDisabled) &&
      (!verifiedOnly || Boolean(account.emailConfirmedAt)) &&
      (!normalizedQuery ||
        account.email.includes(normalizedQuery) ||
        account.displayName?.toLowerCase().includes(normalizedQuery) ||
        account.username?.toLowerCase().includes(normalizedQuery))
  );

  sortAccounts(filteredAccounts, sortBy, sortDirection);
  const offset = cursor ? Number.parseInt(cursor, 10) : 0;
  const safeOffset = Number.isFinite(offset) && offset >= 0 ? offset : 0;
  const page = filteredAccounts.slice(safeOffset, safeOffset + limit);
  const nextOffset = safeOffset + page.length;

  return {
    accounts: await enrichStorage(page, sbAdmin),
    count: filteredAccounts.length,
    nextCursor:
      nextOffset < filteredAccounts.length ? String(nextOffset) : null,
  };
}

export async function mutateInternalAccount({
  action,
  actorUserId,
  confirmationEmail,
  displayName,
  newPassword,
  sbAdmin,
  targetUserId,
  username,
}: {
  action: InternalAccountAction;
  actorUserId: string;
  confirmationEmail?: string;
  displayName?: string;
  newPassword?: string;
  sbAdmin: AdminClient;
  targetUserId: string;
  username?: string | null;
}) {
  if (action !== 'update_profile' && targetUserId === actorUserId) {
    throw new InternalAccountAdminError(
      'You cannot change access for your own account',
      409
    );
  }

  const { data, error } = await sbAdmin.auth.admin.getUserById(targetUserId);
  if (error || !data.user) {
    throw new InternalAccountAdminError('Internal account not found', 404);
  }

  const account = toInternalAccount(data.user, actorUserId);
  if (!account) {
    throw new InternalAccountAdminError('Internal account not found', 404);
  }

  if (action === 'update_profile') {
    const profile = await updateInternalAccountProfile({
      displayName,
      sbAdmin,
      targetUserId,
      username,
    });
    console.info('Internal account administration action completed', {
      action,
      actorUserId,
      targetUserId,
    });
    return { ...account, ...profile };
  }

  if (confirmationEmail?.trim().toLowerCase() !== account.email) {
    throw new InternalAccountAdminError(
      'Confirmation email does not match the target account',
      400
    );
  }

  if (
    action === 'reset_password' &&
    (!newPassword || newPassword.length < 12 || newPassword.length > 72)
  ) {
    throw new InternalAccountAdminError(
      'A password between 12 and 72 characters is required',
      400
    );
  }

  const attributes =
    action === 'reset_password'
      ? { password: newPassword }
      : {
          ban_duration: action === 'disable_access' ? DISABLE_DURATION : 'none',
        };

  const { data: updateData, error: updateError } =
    await sbAdmin.auth.admin.updateUserById(targetUserId, attributes);

  if (updateError || !updateData.user) {
    console.error('Failed to update internal account', {
      action,
      code: updateError?.code,
      targetUserId,
    });
    throw new InternalAccountAdminError(
      'Unable to update the internal account',
      500
    );
  }

  console.info('Internal account administration action completed', {
    action,
    actorUserId,
    targetUserId,
  });

  const updatedAccount = toInternalAccount(updateData.user, actorUserId);
  if (!updatedAccount) {
    throw new InternalAccountAdminError(
      'Unable to verify the updated internal account',
      500
    );
  }

  return updatedAccount;
}
