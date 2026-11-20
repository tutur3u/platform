import { z } from 'zod';

const boundedInteger = (max: number) => z.number().int().min(1).max(max);

export const integrityCommandSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('issue'),
    value: z.string().max(4096),
    limit: boundedInteger(120),
    windowSeconds: boundedInteger(3600),
    ttlMs: boundedInteger(120_000),
  }),
  z.object({ action: z.literal('consume') }),
  z.object({ action: z.literal('read-key') }),
  z.object({ action: z.literal('register'), value: z.string().max(12_000) }),
  z.object({
    action: z.literal('advance'),
    expected: z.number().int().nonnegative(),
    next: z.number().int().positive(),
  }),
  z.object({ action: z.literal('capability') }),
  z.object({ action: z.literal('mark-play') }),
  z.object({ action: z.literal('revoke') }),
  z.object({
    action: z.literal('reserve-provider'),
    limit: boundedInteger(100_000),
    actorLimit: boundedInteger(10_000),
    warningAt: boundedInteger(100_000),
    ttlSeconds: boundedInteger(86_460),
  }),
]);

export type IntegrityCommand = z.infer<typeof integrityCommandSchema>;

export const integrityKeyCounts: Record<IntegrityCommand['action'], number> = {
  issue: 3,
  consume: 1,
  'read-key': 1,
  register: 4,
  advance: 1,
  capability: 2,
  'mark-play': 1,
  revoke: 3,
  'reserve-provider': 3,
};

export const integrityProviderReservationSchema = z.object({
  reserved: z.boolean(),
  used: z.number().int().nonnegative(),
  actor: z.number().int().nonnegative(),
  warning: z.boolean(),
});

export const integrityResultSchema = z.union([
  z.boolean(),
  z.string(),
  z.null(),
  z.number().int().min(0).max(9),
  integrityProviderReservationSchema,
]);

export type IntegrityResult = z.infer<typeof integrityResultSchema>;
