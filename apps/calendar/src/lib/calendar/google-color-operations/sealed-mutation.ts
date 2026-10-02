import { z } from 'zod';
import type { ColorOperationAccess } from './protocol';
import {
  createSealedJournalCodec,
  SealedJournalSchema,
} from './sealed-journal';

export const MutationIdentitySchema = z
  .object({
    wsId: z.guid(),
    eventId: z.guid(),
    connectionId: z.guid(),
    authTokenId: z.guid(),
    calendarId: z.string().min(1),
    providerEventId: z.string().min(1),
  })
  .strict();
export const MutationBindingSchema = z
  .object({
    operationId: z.guid(),
    generation: z.string().regex(/^[1-9][0-9]*$/),
    identity: MutationIdentitySchema,
    action: z.enum(['patch', 'delete']),
    baseETag: z.string().min(1),
  })
  .strict();
const Payload = z
  .object({
    providerPatch: z.record(z.string(), z.unknown()),
    localPatch: z.record(z.string(), z.unknown()),
    providerOptions: z
      .object({
        sendUpdates: z.enum(['all', 'externalOnly', 'none']),
        eventLabelVersion: z.union([z.literal(0), z.literal(1)]).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
export const SealedMutationSchema = SealedJournalSchema;
export type MutationBinding = z.infer<typeof MutationBindingSchema>;
export type MutationPayload = z.infer<typeof Payload>;
export type SealedMutation = z.infer<typeof SealedMutationSchema>;

/** The journal contains ciphertext only.
 * Existing getWorkspaceKey never creates a key; missing keys fail before dispatch.
 * Both sealing and every replay reauthorize the current exact source identity.
 * The server supplies binding/payload; neither is a request recovery-body field. */
export function createSealedMutationCodec(args: {
  access: ColorOperationAccess;
  getKey?: (wsId: string) => Promise<Buffer | null>;
}) {
  return createSealedJournalCodec({
    binding: MutationBindingSchema,
    payload: Payload,
    authorize: (binding) => args.access.assertAllowed(binding.identity),
    workspace: (binding) => binding.identity.wsId,
    getKey: args.getKey,
    unavailableMessage: 'Encrypted Google mutation is unavailable',
  });
}
