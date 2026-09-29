import { randomInt } from 'node:crypto';
import type { SupabaseClient } from '@tuturuuu/supabase/types';
import type { Database } from '@tuturuuu/types';
import { isExactTuturuuuDotComEmail } from '@tuturuuu/utils/email/client';

type AdminClient = SupabaseClient<Database>;
type ReviewAccountKind = 'review' | 'external';

export class ReviewAccountError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

const MARKER = 'infrastructure_review_account';
const ALPHABETS = [
  'abcdefghijkmnopqrstuvwxyz',
  'ABCDEFGHJKLMNPQRSTUVWXYZ',
  '23456789',
  '!@#$%&*+-=?',
];
const PASSWORD_ALPHABET = ALPHABETS.join('');

function generatedPassword() {
  const letters = ALPHABETS.map(
    (alphabet) => alphabet[randomInt(alphabet.length)]!
  );
  for (let index = letters.length; index < 24; index += 1) {
    letters.push(PASSWORD_ALPHABET[randomInt(PASSWORD_ALPHABET.length)]!);
  }
  for (let index = letters.length - 1; index > 0; index -= 1) {
    const other = randomInt(index + 1);
    [letters[index], letters[other]] = [letters[other]!, letters[index]!];
  }
  return letters.join('');
}

function accountKind(
  appMetadata: Record<string, unknown>
): ReviewAccountKind | null {
  const marker = appMetadata[MARKER];
  if (!marker || typeof marker !== 'object') return null;
  const kind = (marker as Record<string, unknown>).kind;
  return kind === 'review' || kind === 'external' ? kind : null;
}

export async function assertActiveReviewerAccount(
  sbAdmin: AdminClient,
  userId: string,
  email: string
) {
  const { data, error } = await sbAdmin.auth.admin.getUserById(userId);
  const user = data.user;
  if (
    error ||
    !user ||
    user.email?.toLowerCase() !== email.trim().toLowerCase() ||
    accountKind(user.app_metadata) !== 'review' ||
    !user.email_confirmed_at ||
    (user.banned_until && Date.parse(user.banned_until) > Date.now())
  ) {
    throw new ReviewAccountError('Active reviewer account not found', 404);
  }
  return user;
}

export async function listReviewAccounts(sbAdmin: AdminClient) {
  const accounts: Array<{
    id: string;
    email: string;
    kind: ReviewAccountKind;
    createdAt: string;
    lastSignInAt: string | null;
    isDisabled: boolean;
    emailConfirmed: boolean;
  }> = [];

  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await sbAdmin.auth.admin.listUsers({
      page,
      perPage: 1000,
    });
    if (error)
      throw new ReviewAccountError('Unable to list review accounts', 503);
    for (const user of data.users) {
      const kind = accountKind(user.app_metadata);
      if (!kind || !user.email) continue;
      accounts.push({
        id: user.id,
        email: user.email,
        kind,
        createdAt: user.created_at,
        lastSignInAt: user.last_sign_in_at ?? null,
        isDisabled: Boolean(
          user.banned_until && Date.parse(user.banned_until) > Date.now()
        ),
        emailConfirmed: Boolean(user.email_confirmed_at),
      });
    }
    if (!data.nextPage)
      return accounts.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  throw new ReviewAccountError('Review account directory is too large', 503);
}

export async function createReviewAccount({
  actorUserId,
  displayName,
  email,
  kind,
  sbAdmin,
}: {
  actorUserId: string;
  displayName: string;
  email: string;
  kind: ReviewAccountKind;
  sbAdmin: AdminClient;
}) {
  const normalizedEmail = email.trim().toLowerCase();
  if (kind === 'review' && !isExactTuturuuuDotComEmail(normalizedEmail)) {
    throw new ReviewAccountError(
      'Reviewer accounts require an organization-controlled @tuturuuu.com email',
      400
    );
  }
  if (kind === 'external' && isExactTuturuuuDotComEmail(normalizedEmail)) {
    throw new ReviewAccountError(
      'Use reviewer account creation for organization-controlled email',
      400
    );
  }

  const marker = {
    kind,
    created_by: actorUserId,
    created_at: new Date().toISOString(),
  };
  // Signup can promote either account kind when its email is pre-provisioned.
  const { data: reservedRole, error: roleError } = await sbAdmin
    .from('platform_email_roles')
    .select('email')
    .eq('email', normalizedEmail)
    .maybeSingle();
  if (roleError)
    throw new ReviewAccountError('Unable to verify account permissions', 503);
  if (reservedRole)
    throw new ReviewAccountError(
      'This address is reserved for a platform role',
      409
    );
  if (kind === 'review') {
    const password = generatedPassword();
    const { data, error } = await sbAdmin.auth.admin.createUser({
      email: normalizedEmail,
      password,
      email_confirm: true,
      user_metadata: { display_name: displayName.trim() },
      app_metadata: { [MARKER]: marker },
    });
    if (error || !data.user) {
      console.error('Failed to create reviewer account', { code: error?.code });
      throw new ReviewAccountError(
        error?.code === 'email_exists'
          ? 'Account already exists'
          : 'Unable to create reviewer account',
        error?.code === 'email_exists' ? 409 : 503
      );
    }
    console.info('Reviewer account created', {
      actorUserId,
      userId: data.user.id,
    });
    return { id: data.user.id, email: normalizedEmail, kind, password };
  }

  const { data, error } = await sbAdmin.auth.admin.inviteUserByEmail(
    normalizedEmail,
    {
      data: { display_name: displayName.trim() },
    }
  );
  if (error || !data.user) {
    console.error('Failed to invite external account', { code: error?.code });
    throw new ReviewAccountError(
      error?.code === 'email_exists'
        ? 'Account already exists'
        : 'Unable to invite external account',
      error?.code === 'email_exists' ? 409 : 503
    );
  }
  const { error: tagError } = await sbAdmin.auth.admin.updateUserById(
    data.user.id,
    {
      app_metadata: { ...data.user.app_metadata, [MARKER]: marker },
    }
  );
  if (tagError) {
    console.error('External account invited but tagging failed', {
      code: tagError.code,
      userId: data.user.id,
    });
    throw new ReviewAccountError(
      'Invitation sent, but account tracking needs administrator attention',
      503
    );
  }
  console.info('External account invited', {
    actorUserId,
    userId: data.user.id,
  });
  return { id: data.user.id, email: normalizedEmail, kind, password: null };
}

export async function updateReviewAccount({
  actorUserId,
  action,
  confirmationEmail,
  sbAdmin,
  userId,
}: {
  actorUserId: string;
  action: 'rotate_password' | 'disable' | 'enable';
  confirmationEmail: string;
  sbAdmin: AdminClient;
  userId: string;
}) {
  if (userId === actorUserId)
    throw new ReviewAccountError(
      'You cannot change your own account here',
      409
    );
  const { data, error } = await sbAdmin.auth.admin.getUserById(userId);
  const user = data.user;
  if (error || !user || !user.email || !accountKind(user.app_metadata)) {
    throw new ReviewAccountError('Review account not found', 404);
  }
  if (user.email.toLowerCase() !== confirmationEmail.trim().toLowerCase()) {
    throw new ReviewAccountError('Confirmation email does not match', 400);
  }
  const kind = accountKind(user.app_metadata);
  if (action === 'rotate_password' && kind !== 'review') {
    throw new ReviewAccountError(
      'External invitees manage their own password',
      400
    );
  }
  const password = action === 'rotate_password' ? generatedPassword() : null;
  const { error: updateError } = await sbAdmin.auth.admin.updateUserById(
    userId,
    password
      ? { password }
      : { ban_duration: action === 'disable' ? '876000h' : 'none' }
  );
  if (updateError) {
    console.error('Failed to update review account', {
      action,
      code: updateError.code,
      userId,
    });
    throw new ReviewAccountError('Unable to update review account', 503);
  }
  console.info('Review account updated', { action, actorUserId, userId });
  return { email: user.email, password };
}
