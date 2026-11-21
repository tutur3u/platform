import { z } from 'zod';
import {
  fleetAnswerActions,
  fleetStateSchema,
} from '../../../web/src/lib/mastermind/fleet/contract';

/**
 * The fleet sync contract is owned by Web (framework-free, zod only) and
 * shared with the publisher script; Mastermind validates every Web response
 * against the same schemas so a drifted or hostile payload never renders.
 * See apps/docs/platform/features/mobile-mastermind.mdx#fleet-sync.
 */
export {
  type FleetDecision,
  type FleetLane,
  type FleetMachine,
  type FleetRelease,
  type FleetResolvedDecision,
  type FleetState,
  fleetAnswerActions,
} from '../../../web/src/lib/mastermind/fleet/contract';
export {
  type FleetLogin,
  type FleetLoginState,
  effectiveLoginState,
  isLoginActionable,
} from '../../../web/src/lib/mastermind/fleet/login';
export { FLEET_FEATURES_HEADER } from '../../../web/src/lib/mastermind/fleet/view';

const slug = z.string().regex(/^[a-z0-9][a-z0-9._-]{0,63}$/);

/** What Web returns for an owner answer: never the reply text itself. */
export const fleetAnswerReceiptSchema = z.object({
  action: z.enum(fleetAnswerActions),
  optionId: slug.optional(),
  revision: z.number().int().min(1),
  answeredAt: z.iso.datetime({ offset: true }),
  pickedUp: z.boolean(),
});
export type FleetAnswerReceipt = z.infer<typeof fleetAnswerReceiptSchema>;

export const fleetStateResponseSchema = z.object({
  state: fleetStateSchema,
  receivedAt: z.iso.datetime({ offset: true }),
  answers: z.record(slug, fleetAnswerReceiptSchema).default({}),
});
export type FleetSnapshot = z.infer<typeof fleetStateResponseSchema>;

export const fleetAnswerRequestSchema = z
  .object({
    decisionId: slug,
    action: z.enum(fleetAnswerActions),
    optionId: slug.optional(),
    text: z.string().trim().max(2000).optional(),
    idempotencyKey: z.uuid(),
  })
  .refine((input) => input.action !== 'reply' || !!input.text, {
    message: 'reply needs text',
    path: ['text'],
  });
export type FleetAnswerRequest = z.infer<typeof fleetAnswerRequestSchema>;
