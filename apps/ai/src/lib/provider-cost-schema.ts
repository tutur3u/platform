import { z } from 'zod';

/** No estimates, invoice totals, credentials, or caller-supplied workspace/app identity. */
export const providerCostSchema = z
  .object({
    accountId: z
      .string()
      .regex(/^[a-zA-Z0-9_-]{1,128}$/)
      .optional(),
    granularity: z.enum(['run', 'account_day']).default('run'),
    provider: z.string().regex(/^[a-z0-9_-]{1,64}$/),
    externalRunId: z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/),
    service: z.string().regex(/^[a-zA-Z0-9_./-]{1,128}$/),
    amountUsd: z.number().finite().min(0).max(999_999_999),
    currency: z.literal('USD'),
    source: z.literal('provider_api'),
    occurredAt: z.iso.datetime({ offset: true }),
    observedAt: z.iso.datetime({ offset: true }),
  })
  .strict()
  .refine(
    (value) => Date.parse(value.occurredAt) <= Date.parse(value.observedAt),
    {
      message: 'Observation must follow the run date',
    }
  );

export function validAccountDay(value: {
  granularity: string;
  accountId?: string;
  occurredAt: string;
}) {
  return (
    value.granularity !== 'account_day' ||
    (Boolean(value.accountId) &&
      new Date(value.occurredAt).toISOString().endsWith('T00:00:00.000Z'))
  );
}
