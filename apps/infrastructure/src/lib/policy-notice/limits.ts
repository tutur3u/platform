import { z } from 'zod';
import { PolicyNoticeError } from './errors';
import type { DeliveryHealth, StopReason } from './types';

// Conservative defaults. Caps stay inside SES guidance: a sending account is
// reviewed at a 5% bounce or 0.1% complaint rate, and production send rates
// start at 14 messages per second.
export const policyNoticeLimitsSchema = z
  .object({
    sendsPerSecond: z.number().min(0.1).max(10).default(2),
    batchSize: z.number().int().min(1).max(100).default(20),
    maxSendsPerInvocation: z.number().int().min(1).max(1000).default(200),
    timeBudgetMs: z.number().int().min(1_000).max(270_000).default(240_000),
    maxBounceRate: z.number().min(0).max(0.05).default(0.02),
    maxComplaintRate: z.number().min(0).max(0.001).default(0.001),
    maxUnknownRate: z.number().min(0).max(0.05).default(0.02),
    minSample: z.number().int().min(20).max(10_000).default(100),
  })
  .strict();

export type PolicyNoticeLimits = z.infer<typeof policyNoticeLimitsSchema>;

export function resolvePolicyNoticeLimits(input: unknown): PolicyNoticeLimits {
  const parsed = policyNoticeLimitsSchema.safeParse(input ?? {});
  if (!parsed.success) throw new PolicyNoticeError('invalid_request');
  return parsed.data;
}

/**
 * Rates are measured against max(attempted, minSample), so a small sample
 * cannot hide a problem rate and one early bounce does not stop a large run.
 * A single complaint before 1,000 attempts still trips the 0.1% default.
 */
export function evaluateBreaker(
  health: DeliveryHealth,
  limits: PolicyNoticeLimits
): StopReason | null {
  const sample = Math.max(health.attempted, limits.minSample);
  if (health.complaints / sample > limits.maxComplaintRate)
    return 'complaint_rate';
  if ((health.rejected + health.hardBounces) / sample > limits.maxBounceRate)
    return 'bounce_rate';
  if (health.unknown / sample > limits.maxUnknownRate) return 'unknown_rate';
  return null;
}
