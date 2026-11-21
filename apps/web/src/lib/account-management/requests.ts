import { z } from 'zod';
import { AccountManagementError, canonicalBodyHash } from './policy';

const uuid = z.uuid();
const operation = { operationId: uuid };
const target = { targetId: uuid };
const confirmed = {
  confirmTarget: uuid,
  challenge: z.string().regex(/^[a-f0-9]{32}$/u),
};
const companyEmail = z
  .email()
  .max(254)
  .refine((email) => email.endsWith('@tuturuuu.com'));

/** The server validates independently of SDK callers, including unknown fields. */
export const mutationSchema = z.discriminatedUnion('action', [
  z
    .object({ action: z.literal('invite'), ...operation, email: companyEmail })
    .strict(),
  z
    .object({
      action: z.literal('role'),
      ...operation,
      ...target,
      workspaceId: uuid,
      roleId: uuid,
    })
    .strict(),
  z
    .object({
      action: z.literal('admin'),
      ...operation,
      ...target,
      ...confirmed,
      enabled: z.boolean(),
    })
    .strict(),
  z
    .object({
      action: z.literal('disable'),
      ...operation,
      ...target,
      disabled: z.boolean(),
    })
    .strict(),
  z
    .object({
      action: z.literal('delete'),
      ...operation,
      ...target,
      ...confirmed,
    })
    .strict(),
  z
    .object({
      action: z.literal('test-create'),
      ...operation,
      label: z.enum(['a1', 'a2']),
    })
    .strict(),
  z
    .object({
      action: z.literal('test-delete'),
      ...operation,
      ...target,
      confirmTarget: uuid,
    })
    .strict(),
]);

export type AccountMutation = z.infer<typeof mutationSchema>;

export function parseMutation(input: unknown): AccountMutation {
  const parsed = mutationSchema.safeParse(input);
  if (!parsed.success) throw new AccountManagementError('invalid_request', 400);
  return parsed.data;
}

/** The challenge itself is excluded to avoid a circular digest when issuing it. */
export function mutationBodyHash(command: AccountMutation) {
  if ('challenge' in command) {
    const { challenge: _challenge, ...body } = command;
    return canonicalBodyHash(body);
  }
  return canonicalBodyHash(command);
}

export function requireMutationRoute(
  command: AccountMutation,
  route: { action: AccountMutation['action']; targetId?: string }
) {
  if (
    command.action !== route.action ||
    ('targetId' in command
      ? command.targetId !== route.targetId
      : route.targetId !== undefined)
  ) {
    throw new AccountManagementError('invalid_request', 400);
  }
}
