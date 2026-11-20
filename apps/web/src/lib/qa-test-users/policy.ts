import { randomBytes } from 'node:crypto';
import { z } from 'zod';

// Reserved addresses: staff hosts on the staff domain, participants on the routed QA domain.
export {
  isQaTestAccount,
  QA_TEST_ADDRESS,
} from '@tuturuuu/utils/qa-test-account';
export const QA_RUN_ID = /^[a-z0-9]{8}$/u;
export const QA_PURPOSE = /^[a-z0-9][a-z0-9-]{1,47}$/u;
export const QA_MIN_TTL_SECONDS = 15 * 60;
export const QA_MAX_TTL_SECONDS = 72 * 60 * 60;
export const QA_MAX_CREATE_COUNT = 50;
/** Accounts created concurrently per request; Auth admin calls are serialized beyond this. */
export const QA_CREATE_CONCURRENCY = 5;
/** Accounts deleted per cleanup request or cron slot. */
export const QA_CLEANUP_LIMIT = 25;

export type QaTier = 'FREE' | 'PLUS' | 'PRO';

export const createQaUsersSchema = z
  .object({
    count: z.number().int().min(1).max(QA_MAX_CREATE_COUNT),
    staff: z.boolean().default(false),
    tier: z
      .enum(['free', 'plus', 'pro'])
      .default('free')
      .transform((tier) => tier.toUpperCase() as QaTier),
    purpose: z.string().regex(QA_PURPOSE).optional(),
    ttlSeconds: z
      .number()
      .int()
      .min(QA_MIN_TTL_SECONDS)
      .max(QA_MAX_TTL_SECONDS)
      .optional(),
    runId: z.string().regex(QA_RUN_ID).optional(),
    workspace: z.boolean().default(false),
  })
  .strict()
  .refine((input) => input.runId || (input.purpose && input.ttlSeconds), {
    message: 'A new run needs a purpose and TTL',
  });
export type CreateQaUsersInput = z.output<typeof createQaUsersSchema>;

export const cleanupQaUsersSchema = z.union([
  z.object({ runId: z.string().regex(QA_RUN_ID) }).strict(),
  z.object({ expired: z.literal(true) }).strict(),
]);

export const mintQaSessionSchema = z
  .object({ origin: z.url().max(512).optional() })
  .strict();

/** 32 random bytes as base64url: never logged, returned once at creation. */
export function generateQaPassword() {
  return randomBytes(32).toString('base64url');
}

/** Service-owned marker. The database refuses any later change to `qa_*` keys. */
export function qaTestMarker({
  expiresAt,
  operatorUserId,
  purpose,
  runId,
  staff,
}: {
  expiresAt: string;
  operatorUserId: string;
  purpose: string;
  runId: string;
  staff: boolean;
}) {
  return {
    qa_test: true,
    qa_run: runId,
    qa_owner: operatorUserId,
    qa_purpose: purpose,
    qa_expires_at: expiresAt,
    qa_staff: staff,
  } as const;
}
