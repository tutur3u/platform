import { z } from 'zod';

const Uuid = z.uuid().refine((value) => value === value.toLowerCase());
const Address = z
  .email()
  .refine((value) => value === value.trim().toLowerCase());
const IdentityKey = z.object({
  identity_id: Uuid,
  provider: z.string().regex(/^[a-z0-9_:-]+$/),
  user_id: Uuid,
});
const Identity = IdentityKey.extend({
  id: z.string().min(1),
  identity_data: z
    .object({
      email: z.string().optional(),
      email_verified: z.boolean().optional(),
    })
    .optional(),
});
const Identities = z
  .array(Identity)
  .min(1)
  .superRefine((items, context) => {
    if (new Set(items.map((item) => item.identity_id)).size !== items.length) {
      context.addIssue({ code: 'custom', message: 'Duplicate identity IDs' });
    }
  });
const User = z.object({
  id: Uuid,
  email: Address,
  email_confirmed_at: z.iso.datetime({ offset: true }).nullish(),
  new_email: z.string().nullish(),
  deleted_at: z.iso.datetime({ offset: true }).nullish(),
  banned_until: z.iso.datetime({ offset: true }).nullish(),
  is_anonymous: z.boolean(),
  identities: Identities,
});
const ReadResponse = z.object({
  data: z.object({ user: User }),
  error: z.null(),
});
const WriteResponse = z.object({ error: z.null() });
const Binding = z
  .strictObject({
    userId: Uuid,
    sourceAddress: Address,
    destinationAddress: Address,
  })
  .refine((value) => value.sourceAddress !== value.destinationAddress);

export type EmployeeAddressMigrationProviderBinding = z.infer<typeof Binding>;
export type EmployeeAddressMigrationProviderAuthorization =
  EmployeeAddressMigrationProviderBinding & { action: 'read' | 'changeEmail' };

export type EmployeeAddressMigrationAuthAdmin = {
  getUserById(userId: string): Promise<unknown>;
  updateUserById(
    userId: string,
    attributes: { email: string }
  ): Promise<unknown>;
};

/** SHA-256 of compact UTF-8 JSON tuples [identity_id, provider, user_id],
 * sorted by identity_id (ASCII). GoTrue identity_id is SQL identities.id;
 * GoTrue id is SQL provider_id. Email, verification and timestamps are excluded.
 * SQL must emit compact JSON, not jsonb::text with its intervening spaces.
 */
export async function fingerprintEmployeeAddressMigrationIdentities(
  input: unknown
) {
  const identities = z.array(IdentityKey).min(1).parse(input);
  if (
    new Set(identities.map((item) => item.identity_id)).size !==
    identities.length
  ) {
    notReady();
  }
  const tuples = identities
    .map(({ identity_id, provider, user_id }) => [
      identity_id,
      provider,
      user_id,
    ])
    .sort((left, right) => {
      const a = left[0] ?? '';
      const b = right[0] ?? '';
      return a < b ? -1 : a > b ? 1 : 0;
    });
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(tuples))
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('');
}

function notReady(): never {
  throw new Error('Address migration provider is not ready; inspect only');
}

/** Request-scoped supplier. The journal owns durable one-winner admission across
 * instances; this fence consumes the sole local mutation entry before any await.
 * Unknown write outcomes are never retried. Only fresh reads can qualify them.
 */
export function createEmployeeAddressMigrationProvider(options: {
  admin: EmployeeAddressMigrationAuthAdmin;
  binding: EmployeeAddressMigrationProviderBinding;
  authorize(
    context: EmployeeAddressMigrationProviderAuthorization
  ): Promise<boolean>;
}) {
  const binding = Object.freeze(Binding.parse(options.binding));
  const admin = options.admin;
  const authorize = options.authorize;
  let mutationEntered = false;
  let initialFingerprint: string | undefined;

  async function requireAuthorization(action: 'read' | 'changeEmail') {
    if ((await authorize(Object.freeze({ ...binding, action }))) !== true)
      notReady();
  }

  async function read(userId: string) {
    if (userId !== binding.userId) notReady();
    await requireAuthorization('read');
    const {
      data: { user },
    } = ReadResponse.parse(await admin.getUserById(userId));
    if (
      user.id !== binding.userId ||
      ![binding.sourceAddress, binding.destinationAddress].includes(
        user.email
      ) ||
      user.identities.some((identity) => identity.user_id !== user.id)
    )
      notReady();
    const providerIdentityFingerprint =
      await fingerprintEmployeeAddressMigrationIdentities(user.identities);
    initialFingerprint ??= providerIdentityFingerprint;
    const emailIdentities = user.identities.filter(
      (identity) => identity.provider === 'email'
    );
    // GoTrue admin {email} can preserve email_confirmed_at while writing the
    // identity's email_verified=false. That timestamp alone is insufficient.
    const confirmedAt = user.email_confirmed_at
      ? Date.parse(user.email_confirmed_at)
      : Number.NaN;
    const emailVerified =
      confirmedAt <= Date.now() &&
      !user.new_email &&
      emailIdentities.length === 1 &&
      emailIdentities.every(
        (identity) =>
          identity.id === user.id &&
          identity.identity_data?.email === user.email &&
          identity.identity_data.email_verified === true
      );
    const active =
      !user.deleted_at &&
      !user.is_anonymous &&
      (!user.banned_until || Date.parse(user.banned_until) <= Date.now());
    return {
      userId: user.id,
      email: user.email,
      emailVerified,
      active,
      providerIdentityFingerprint,
    };
  }

  return {
    read,
    async changeEmail(
      userId: string,
      destinationAddress: string
    ): Promise<void> {
      if (
        userId !== binding.userId ||
        destinationAddress !== binding.destinationAddress ||
        mutationEntered
      )
        notReady();
      mutationEntered = true;
      if (!initialFingerprint) notReady();
      const current = await read(userId);
      if (
        current.email !== binding.sourceAddress ||
        !current.emailVerified ||
        !current.active ||
        current.providerIdentityFingerprint !== initialFingerprint
      )
        notReady();
      await requireAuthorization('changeEmail');
      WriteResponse.parse(
        await admin.updateUserById(userId, {
          email: binding.destinationAddress,
        })
      );
    },
  };
}
