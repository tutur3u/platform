import type {
  InternalAccount,
  InternalAccountAction,
} from '@tuturuuu/internal-api/infrastructure';
import type { SupabaseUser } from '@tuturuuu/supabase/next/user';
import type { SupabaseClient } from '@tuturuuu/supabase/types';
import type { Database } from '@tuturuuu/types';
import { isExactTuturuuuDotComEmail } from '@tuturuuu/utils/email/client';

type AdminClient = SupabaseClient<Database>;

const AUTH_USERS_PAGE_SIZE = 1000;
const MAX_AUTH_USER_PAGES = 10;
const DISABLE_DURATION = '876000h';

export class InternalAccountAdminError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = 'InternalAccountAdminError';
  }
}

function getDisplayName(user: SupabaseUser): string | null {
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
    displayName: getDisplayName(user),
    email,
    emailConfirmedAt: user.email_confirmed_at ?? null,
    id: user.id,
    isDisabled: isAccountDisabled(user.banned_until),
    isSelf: user.id === actorUserId,
    lastSignInAt: user.last_sign_in_at ?? null,
  };
}

export async function listInternalAccountUsers({
  actorUserId,
  q,
  sbAdmin,
}: {
  actorUserId: string;
  q?: string;
  sbAdmin: AdminClient;
}) {
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
    if (!data.nextPage) break;
    page = data.nextPage;
  }

  if (page > MAX_AUTH_USER_PAGES) {
    console.error('Internal account listing exceeded the safety page budget');
    throw new InternalAccountAdminError(
      'Unable to load internal accounts',
      500
    );
  }

  const normalizedQuery = q?.trim().toLowerCase();
  const accounts = authUsers
    .map((user) => toInternalAccount(user, actorUserId))
    .filter((account): account is InternalAccount => account !== null)
    .filter(
      (account) =>
        !normalizedQuery ||
        account.email.includes(normalizedQuery) ||
        account.displayName?.toLowerCase().includes(normalizedQuery)
    )
    .sort((left, right) => left.email.localeCompare(right.email));

  return { accounts, count: accounts.length };
}

export async function mutateInternalAccount({
  action,
  actorUserId,
  confirmationEmail,
  newPassword,
  sbAdmin,
  targetUserId,
}: {
  action: InternalAccountAction;
  actorUserId: string;
  confirmationEmail: string;
  newPassword?: string;
  sbAdmin: AdminClient;
  targetUserId: string;
}) {
  if (targetUserId === actorUserId) {
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

  if (confirmationEmail.trim().toLowerCase() !== account.email) {
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
