import { z } from 'zod';
export const AccountBenefitKey = z
  .string()
  .regex(/^(feature|early_access)\.[a-z][a-z0-9_.-]{0,79}$/)
  .or(z.literal('ai_credits'));
export const AccountBenefitGrant = z
  .object({
    userId: z.guid(),
    key: AccountBenefitKey,
    amount: z.number().int().min(1).max(1_000_000),
    reason: z.string().trim().min(3).max(500),
    expiresAt: z.iso.datetime({ offset: true }).nullable(),
    requestId: z.guid(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.key !== 'ai_credits' && value.amount !== 1)
      ctx.addIssue({
        code: 'custom',
        message: 'Feature grants have amount one',
      });
    if (value.key === 'ai_credits' && value.expiresAt !== null)
      ctx.addIssue({
        code: 'custom',
        message: 'Credits use the billing period expiry',
      });
  });
export function hasAccountBenefit(
  grants: {
    benefit_key: string;
    starts_at: string;
    expires_at: string | null;
    revoked_at: string | null;
  }[],
  key: string,
  now = Date.now()
) {
  return grants.some(
    (grant) =>
      grant.benefit_key === key &&
      !grant.revoked_at &&
      Date.parse(grant.starts_at) <= now &&
      (!grant.expires_at || Date.parse(grant.expires_at) > now)
  );
}
