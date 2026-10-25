import { z } from 'zod';
import { PASSWORDS_LIMITS, VAULT_ROLES } from './port';

const id = z.string().uuid();
const wsId = z.string().min(1).max(64);
const requestId = z.string().uuid();
const revision = z.number().int().nonnegative();
const name = z.string().trim().min(1).max(PASSWORDS_LIMITS.nameMaxLength);
const maxBase64Length = Math.ceil(PASSWORDS_LIMITS.itemMaxBytes / 3) * 4;
const base64 = z
  .string()
  .max(maxBase64Length)
  .regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/);

export const stateInput = z.object({ wsId, vaultId: id.optional() });
export const createVaultInput = z.object({ wsId, name, requestId });
export const putItemInput = z.object({
  wsId,
  vaultId: id,
  name,
  base64,
  requestId,
  revision,
});
export const revealItemInput = z.object({
  wsId,
  vaultId: id,
  itemId: id,
  requestId,
});
export const setMemberInput = z.object({
  wsId,
  vaultId: id,
  userId: id,
  role: z.enum(VAULT_ROLES),
  revoked: z.boolean(),
  requestId,
  revision,
});
export const rotateVaultInput = z.object({
  wsId,
  vaultId: id,
  requestId,
  revision,
});
export const auditInput = z.object({ wsId, vaultId: id });

export const observeOperationInput = z.object({
  wsId,
  vaultId: id,
  targetRequestId: requestId,
});

export function sanitizedValidator<T>(schema: z.ZodType<T>) {
  return (input: unknown): T => {
    const result = schema.safeParse(input);
    if (!result.success) throw new Error('INVALID_INPUT');
    return result.data;
  };
}

export const ownerCredentialInput = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('owner'), wsId, vaultId: id }),
  z.object({
    kind: z.literal('agent'),
    wsId,
    vaultId: id,
    grantRequestId: id,
    tokenRequestId: id,
    itemIds: z.array(id).min(1).max(16),
    scopes: z
      .array(z.enum(['item.read', 'item.write']))
      .min(1)
      .max(2),
  }),
]);
