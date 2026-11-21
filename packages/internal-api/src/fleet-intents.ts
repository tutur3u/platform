import { z } from 'zod';

const projectKey = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/);
const target = {
  projectKey,
  targetKey: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/),
};
const quote = z.string().trim().min(1).max(1000).optional();
const release = z.strictObject({
  ...target,
  environment: z.enum(['staging', 'production']),
  commitSha: z.string().regex(/^[0-9a-f]{40}$/),
});

const intentKinds = [
  'status_question',
  'comment',
  'priority.set',
  'approve.item',
  'work.create',
  'work.redirect',
  'lane.pause',
  'approve.deploy',
  'approve.production_change',
] as const;

export const fleetIntentInputSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('status_question'),
    payload: z.strictObject({
      projectKey,
      topic: z.enum(['status', 'readiness', 'timeline']),
    }),
    quote,
  }),
  z.strictObject({
    kind: z.literal('comment'),
    payload: z.strictObject(target),
    quote: quote.unwrap(),
  }),
  z.strictObject({
    kind: z.literal('priority.set'),
    payload: z.strictObject({
      ...target,
      priority: z.enum(['low', 'normal', 'high', 'urgent']),
    }),
    quote,
  }),
  z.strictObject({
    kind: z.literal('approve.item'),
    payload: z.strictObject(target),
    quote,
  }),
  z.strictObject({
    kind: z.literal('work.create'),
    payload: z.strictObject({
      ...target,
      template: z.enum(['investigation', 'maintenance', 'regression_fix']),
    }),
    quote,
  }),
  z.strictObject({
    kind: z.literal('work.redirect'),
    payload: z.strictObject({
      ...target,
      objective: z.enum(['investigate', 'verify', 'prepare_review']),
    }),
    quote,
  }),
  z.strictObject({
    kind: z.literal('lane.pause'),
    payload: z.strictObject(target),
    quote,
  }),
  z.strictObject({
    kind: z.literal('approve.deploy'),
    payload: release,
    quote,
  }),
  z.strictObject({
    kind: z.literal('approve.production_change'),
    payload: release.extend({ environment: z.literal('production') }),
    quote,
  }),
]);

export type FleetIntentInput = z.infer<typeof fleetIntentInputSchema>;

export const fleetIntentReceiptSchema = z.strictObject({
  id: z.uuid(),
  kind: z.enum(intentKinds),
  state: z.enum([
    'pending_approval',
    'approved',
    'rejected',
    'claimed',
    'dispatched',
    'done',
    'failed',
    'expired',
    'cancelled',
  ]),
  createdAt: z.iso.datetime({ precision: 3 }),
});

export type FleetIntentReceipt = z.infer<typeof fleetIntentReceiptSchema>;
