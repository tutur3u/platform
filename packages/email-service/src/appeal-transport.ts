import { z } from 'zod';

export const appealBindingSchema = z
  .object({
    grantId: z.uuid(),
    sourceAccountId: z.string().regex(/^\d{12}$/),
    sourceRegion: z.string().regex(/^[a-z]{2}-[a-z]+-\d$/),
    accountId: z.string().regex(/^\d{12}$/),
    region: z.string().regex(/^[a-z]{2}-[a-z]+-\d$/),
    identity: z.email(),
    configurationSet: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
    ipPool: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
    purpose: z.literal('workspace_report_reenable'),
    confirmationOrigin: z.url().refine((value) => {
      const url = new URL(value);
      return (
        url.protocol === 'https:' &&
        url.origin === value &&
        !url.username &&
        !url.password
      );
    }),
  })
  .strict()
  .refine((binding) => binding.accountId !== binding.sourceAccountId);

export type AppealBinding = z.infer<typeof appealBindingSchema>;
export type SuppressionLookup =
  | {
      status: 'eligible';
      hardBounce: boolean;
      source: 'clear' | 'bounce' | 'complaint';
      generation: string;
    }
  | {
      status: 'blocked';
      hardBounce: boolean;
      accountId: string;
      region: string;
      generation: string;
    }
  | { status: 'unknown'; hardBounce: boolean };

export type ConfirmationInput = {
  appealId: string;
  dispatchId: string;
  wsId: string;
  email: string;
  workspaceName: string;
  url: string;
  purpose: 'workspace_report_reenable';
  generation: string;
  providerGeneration: string;
};

export type AppealSendOutcome =
  | { status: 'accepted'; messageId: string }
  | { status: 'unknown' }
  | { status: 'rejected' };

export type AppealTransport = {
  binding: AppealBinding;
  lookupSuppression(email: string): Promise<SuppressionLookup>;
  sendConfirmation(input: ConfirmationInput): Promise<AppealSendOutcome>;
};

export function bindingToDatabase(binding: AppealBinding) {
  return {
    grant_id: binding.grantId,
    source_account_id: binding.sourceAccountId,
    source_region: binding.sourceRegion,
    account_id: binding.accountId,
    region: binding.region,
    identity: binding.identity,
    configuration_set: binding.configurationSet,
    ip_pool: binding.ipPool,
    purpose: binding.purpose,
    confirmation_origin: binding.confirmationOrigin,
  };
}

export function parseDatabaseBinding(value: unknown): AppealBinding | null {
  const db = z
    .object({
      grant_id: z.unknown(),
      source_account_id: z.unknown(),
      source_region: z.unknown(),
      account_id: z.unknown(),
      region: z.unknown(),
      identity: z.unknown(),
      configuration_set: z.unknown(),
      ip_pool: z.unknown(),
      purpose: z.unknown(),
      confirmation_origin: z.unknown(),
    })
    .safeParse(value);
  if (!db.success) return null;
  const row = db.data;
  const result = appealBindingSchema.safeParse({
    grantId: row.grant_id,
    sourceAccountId: row.source_account_id,
    sourceRegion: row.source_region,
    accountId: row.account_id,
    region: row.region,
    identity: row.identity,
    configurationSet: row.configuration_set,
    ipPool: row.ip_pool,
    purpose: row.purpose,
    confirmationOrigin: row.confirmation_origin,
  });
  return result.success ? result.data : null;
}
