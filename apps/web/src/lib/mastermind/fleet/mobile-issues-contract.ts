import { z } from 'zod';

const build = z.number().int().min(1).max(2147483647);
const facts = {
  platform: z.enum(['ios', 'android']),
  issueId: z.string().regex(/^[a-f0-9]{32}$/u),
  build,
  count: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
};

const candidate = z
  .discriminatedUnion('kind', [
    z.strictObject({ ...facts, kind: z.literal('new') }),
    z.strictObject({
      ...facts,
      kind: z.literal('regression'),
      fixBuild: build,
    }),
    z.strictObject({ ...facts, kind: z.literal('spike') }),
    z.strictObject({
      ...facts,
      kind: z.literal('test'),
      issueId: z.literal('00000000000000000000000000000000'),
      count: z.literal(1),
      build: z.literal(1),
    }),
  ])
  .refine(
    (alert) => alert.kind !== 'regression' || alert.build >= alert.fixBuild
  );

const timestamp = z.iso.datetime({ precision: 3 });
export const mobileIssueBatchSchema = z.strictObject({
  slot: timestamp,
  alerts: z.array(candidate).min(1).max(20),
});
export type MobileIssueBatch = z.infer<typeof mobileIssueBatchSchema>;

export const mobileIssueAlertSchema = z.strictObject({
  ...facts,
  id: z.string().regex(/^mobile-[a-f0-9]{32}$/u),
  kind: z.enum(['new', 'regression', 'spike', 'test']),
  priority: z.enum(['fyi', 'decision']),
  startedAt: timestamp,
});
export type MobileIssueAlert = z.infer<typeof mobileIssueAlertSchema>;
export const mobileIssueAlertsSchema = z
  .array(mobileIssueAlertSchema.strip())
  .max(20);
