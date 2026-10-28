import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import {
  createPrivateDevboxClient,
  getDevboxStorageError,
} from './store-utils';

const Scope = z.enum(['devbox:read', 'devbox:run', 'devbox:build']);
const Grant = z.object({
  id: z.uuid(),
  user_id: z.uuid(),
  status: z.enum(['pending', 'active', 'suspended', 'revoked', 'expired']),
  suspended: z.boolean(),
  accepted_at: z.iso.datetime({ offset: true }).nullable(),
  revoked_at: z.iso.datetime({ offset: true }).nullable(),
  expires_at: z.iso.datetime({ offset: true }),
  sessions_not_before: z.iso.datetime({ offset: true }),
  require_mfa: z.boolean(),
});
const Identity = z.object({
  enabled: z.boolean(),
  grant: Grant.nullable(),
  token: z
    .object({
      id: z.uuid(),
      user_id: z.uuid(),
      grant_id: z.uuid(),
      scopes: z.array(Scope),
    })
    .nullable(),
});

export async function identityRpc(name: string, args: Record<string, unknown>) {
  const client = await createPrivateDevboxClient();
  const { data, error } = await client.rpc<unknown>(name, args);
  if (error) throw getDevboxStorageError(error);
  return data;
}
export async function resolveDevboxIdentity(
  input: { userId: string } | { token: string }
) {
  try {
    const value = await identityRpc(
      'resolve_devbox_identity',
      'token' in input
        ? { p_hash: createHash('sha256').update(input.token).digest('hex') }
        : { p_user_id: input.userId }
    );
    return Identity.nullable().parse(value);
  } catch {
    // Missing row/column/function, invalid data, and read failures are disabled.
    return null;
  }
}
export const IssueTokenSchema = z
  .object({
    label: z.string().regex(/^[a-z0-9-]{1,40}$/),
    scopes: z.array(Scope).min(1).max(3),
    expiresInDays: z.number().int().min(1).max(30).default(7),
  })
  .strict();
export async function issueDevboxAccessToken(
  userId: string,
  issuedAt: number,
  input: z.infer<typeof IssueTokenSchema>,
  cli = true
) {
  const token = `tdba_${randomBytes(32).toString('hex')}`;
  const id = z.uuid().parse(
    await identityRpc('issue_devbox_access_token', {
      p_user_id: userId,
      p_cli: cli,
      p_issued_at: new Date(issuedAt).toISOString(),
      p_label: input.label,
      p_hash: createHash('sha256').update(token).digest('hex'),
      p_prefix: token.slice(0, 13),
      p_scopes: input.scopes,
      p_expires_at: new Date(
        Date.now() + input.expiresInDays * 86400000
      ).toISOString(),
    })
  );
  return { id, token };
}
