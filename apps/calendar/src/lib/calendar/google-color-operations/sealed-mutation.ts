import { createDecipheriv } from 'node:crypto';
import { encryptField } from '@tuturuuu/utils/encryption';
import { z } from 'zod';
import { getWorkspaceKey } from '../../workspace-encryption';
import { type ColorOperationAccess, ColorOperationError } from './protocol';

const Identity = z
  .object({
    wsId: z.guid(),
    eventId: z.guid(),
    connectionId: z.guid(),
    authTokenId: z.guid(),
    calendarId: z.string().min(1),
    providerEventId: z.string().min(1),
  })
  .strict();
const Binding = z
  .object({
    operationId: z.guid(),
    generation: z.string().regex(/^[1-9][0-9]*$/),
    identity: Identity,
    action: z.enum(['patch', 'delete']),
    baseETag: z.string().min(1),
  })
  .strict();
const Payload = z
  .object({
    providerPatch: z.record(z.string(), z.unknown()),
    localPatch: z.record(z.string(), z.unknown()),
  })
  .strict();
const Envelope = z
  .object({ version: z.literal(1), binding: Binding, payload: Payload })
  .strict();
const Journal = z
  .object({ version: z.literal(1), ciphertext: z.string().min(1) })
  .strict();
export type MutationBinding = z.infer<typeof Binding>;
export type MutationPayload = z.infer<typeof Payload>;
export type SealedMutation = z.infer<typeof Journal>;

function unavailable(): never {
  throw new ColorOperationError(
    'unavailable',
    'Encrypted Google mutation is unavailable'
  );
}

/** Candidate only, deliberately unwired. The journal contains ciphertext only.
 * Existing getWorkspaceKey never creates a key; missing keys fail before dispatch.
 * Both sealing and every replay reauthorize the current exact source identity.
 * The server supplies binding/payload; neither is a request recovery-body field. */
export function createSealedMutationCodec(args: {
  access: ColorOperationAccess;
  getKey?: (wsId: string) => Promise<Buffer | null>;
}) {
  const getKey = args.getKey ?? getWorkspaceKey;
  async function authorizedKey(binding: MutationBinding) {
    await args.access.assertAllowed(binding.identity);
    const key = await getKey(binding.identity.wsId);
    if (!key || !Buffer.isBuffer(key) || key.length !== 32) unavailable();
    return key;
  }
  return {
    async seal(
      binding: MutationBinding,
      payload: MutationPayload
    ): Promise<SealedMutation> {
      const parsed = Envelope.safeParse({ version: 1, binding, payload });
      if (!parsed.success) unavailable();
      const key = await authorizedKey(parsed.data.binding);
      return {
        version: 1,
        ciphertext: encryptField(JSON.stringify(parsed.data), key),
      };
    },
    async open(
      binding: MutationBinding,
      journal: SealedMutation
    ): Promise<MutationPayload> {
      const expected = Binding.safeParse(binding);
      const sealed = Journal.safeParse(journal);
      if (!expected.success || !sealed.success) unavailable();
      const key = await authorizedKey(expected.data);
      // Same iv(12) + AES-256-GCM ciphertext + tag(16) format as encryptField.
      // Recovery must authenticate strictly: legacy decryptField intentionally
      // falls back to its input on errors, which is unsafe for durable replay.
      try {
        const encoded = sealed.data.ciphertext;
        const bytes = Buffer.from(encoded, 'base64');
        if (bytes.length < 29 || bytes.toString('base64') !== encoded)
          unavailable();
        const decipher = createDecipheriv(
          'aes-256-gcm',
          key,
          bytes.subarray(0, 12)
        );
        decipher.setAuthTag(bytes.subarray(-16));
        const plaintext = Buffer.concat([
          decipher.update(bytes.subarray(12, -16)),
          decipher.final(),
        ]).toString('utf8');
        const envelope = Envelope.safeParse(JSON.parse(plaintext));
        // Parsed strict schemas establish stable key ordering for comparison.
        if (
          !envelope.success ||
          JSON.stringify(envelope.data.binding) !==
            JSON.stringify(expected.data)
        )
          unavailable();
        return envelope.data.payload;
      } catch {
        // Only envelope/crypto parsing is caught. Authorization/key errors above
        // retain their semantics; no provider call or error is swallowed here.
        return unavailable();
      }
    },
  };
}
