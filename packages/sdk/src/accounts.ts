import {
  createInternalApiClient,
  InternalApiError,
  type InternalApiClientOptions,
} from '@tuturuuu/internal-api/client';
import { z } from 'zod';

const uuid = z.uuid();
const operation = { operationId: uuid };
const target = { targetId: uuid };
const confirmation = {
  confirmTarget: uuid,
  challenge: z.string().regex(/^[a-f0-9]{32}$/u),
};
const companyEmail = z
  .email()
  .refine((email) => email.endsWith('@tuturuuu.com'));

export const accountCommandSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('list'),
      limit: z.number().int().min(1).max(100).default(25),
      cursor: uuid.optional(),
    })
    .strict(),
  z.object({ action: z.literal('status'), ...target }).strict(),
  z
    .object({ action: z.literal('create'), ...operation, email: companyEmail })
    .strict(),
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
      ...confirmation,
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
      ...confirmation,
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

export type AccountCommand = z.infer<typeof accountCommandSchema>;

const accountSummary = z.object({
  id: uuid,
  disabled: z.boolean(),
  test: z.boolean(),
});
const listResponse = z.object({
  accounts: z
    .array(
      accountSummary.extend({
        maskedEmail: z
          .string()
          .max(254)
          .regex(/^[^@]*\*[^@]*@[^@]+$/u),
      })
    )
    .max(100),
  nextCursor: uuid.nullable(),
});
const statusResponse = z.object({
  account: accountSummary.extend({ email: z.email() }),
});
const mutationResponse = z.object({
  operationId: uuid,
  targetId: uuid.optional(),
  status: z.enum(['completed', 'pending', 'unknown']),
});

/** HTTPS-only control plane. The server remains authoritative for every permission. */
export class AccountsClient {
  private readonly api;

  constructor(options: InternalApiClientOptions) {
    const parsed = z.url().safeParse(options.baseUrl);
    if (!parsed.success)
      throw new Error('Account management requires an explicit HTTPS origin.');
    const url = new URL(parsed.data);
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== '/'
    ) {
      throw new Error(
        'Account management requires an HTTPS origin without credentials or a path.'
      );
    }
    this.api = createInternalApiClient(options);
  }

  async execute(input: AccountCommand) {
    const parsed = accountCommandSchema.safeParse(input);
    if (!parsed.success)
      throw new Error('Invalid account command. Check the documented fields.');
    const command = parsed.data;
    if (
      'confirmTarget' in command &&
      command.confirmTarget !== command.targetId
    ) {
      throw new Error('Exact target UUID confirmation is required.');
    }
    const root = '/api/v1/admin/accounts';
    try {
      if (command.action === 'list') {
        return listResponse.parse(
          await this.api.json<unknown>(root, {
            cache: 'no-store',
            query: { limit: command.limit, cursor: command.cursor },
          })
        );
      }
      if (command.action === 'status') {
        return statusResponse.parse(
          await this.api.json<unknown>(`${root}/${command.targetId}`, {
            cache: 'no-store',
          })
        );
      }
      const path =
        command.action === 'create'
          ? root
          : command.action === 'invite'
            ? `${root}/invite`
            : command.action === 'test-create'
              ? `${root}/tests`
              : command.action === 'test-delete'
                ? `${root}/tests/${command.targetId}`
                : command.action === 'delete'
                  ? `${root}/${command.targetId}`
                  : `${root}/${command.targetId}/${command.action}`;
      return mutationResponse.parse(
        await this.api.json<unknown>(path, {
          method:
            command.action === 'delete' || command.action === 'test-delete'
              ? 'DELETE'
              : 'POST',
          cache: 'no-store',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': command.operationId,
          },
          body: JSON.stringify(command),
        })
      );
    } catch (error) {
      // Supplier errors and invalid responses may contain credentials; never echo them.
      if (error instanceof InternalApiError && error.status === 401) {
        throw new Error('Account authorization or fresh MFA is required.');
      }
      if (error instanceof InternalApiError && error.status === 503) {
        throw new Error(
          'Account operation is unavailable. Use status to reconcile before retrying.'
        );
      }
      throw new Error(
        'Account request failed. Use status to reconcile before retrying.'
      );
    }
  }
}
