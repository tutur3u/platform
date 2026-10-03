import { createDecipheriv } from 'node:crypto';
import { encryptField } from '@tuturuuu/utils/encryption';
import { z } from 'zod';
import { getWorkspaceKey } from '../../workspace-encryption';
import { ColorOperationError } from './protocol';

export const SealedJournalSchema = z
  .object({ version: z.literal(1), ciphertext: z.string().min(1) })
  .strict();
export type SealedJournal = z.infer<typeof SealedJournalSchema>;

/** The strict binding schema authenticates every operation endpoint and version.
 * Authorization and existing-key lookup run outside the parsing catch on every
 * seal/open. Callers derive the workspace only from the parsed server binding. */
export function createSealedJournalCodec<Binding, Payload>(args: {
  binding: z.ZodType<Binding>;
  payload: z.ZodType<Payload>;
  authorize: (binding: Binding) => Promise<void>;
  workspace: (binding: Binding) => string;
  getKey?: (wsId: string) => Promise<Buffer | null>;
  unavailableMessage?: string;
}) {
  function unavailable(): never {
    throw new ColorOperationError(
      'unavailable',
      args.unavailableMessage ?? 'Encrypted provider journal unavailable'
    );
  }
  const envelope = z
    .object({
      version: z.literal(1),
      binding: args.binding,
      payload: args.payload,
    })
    .strict();
  async function authorizedKey(binding: Binding) {
    await args.authorize(binding);
    const key = await (args.getKey ?? getWorkspaceKey)(args.workspace(binding));
    if (!key || !Buffer.isBuffer(key) || key.length !== 32) unavailable();
    return key;
  }
  return {
    async seal(binding: Binding, payload: Payload): Promise<SealedJournal> {
      const parsed = envelope.safeParse({ version: 1, binding, payload });
      if (!parsed.success) unavailable();
      const key = await authorizedKey(parsed.data.binding);
      return {
        version: 1,
        ciphertext: encryptField(JSON.stringify(parsed.data), key),
      };
    },
    async open(binding: Binding, journal: SealedJournal): Promise<Payload> {
      const expected = args.binding.safeParse(binding);
      const sealed = SealedJournalSchema.safeParse(journal);
      if (!expected.success || !sealed.success) unavailable();
      const key = await authorizedKey(expected.data);
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
        const parsed = envelope.safeParse(JSON.parse(plaintext));
        if (
          !parsed.success ||
          JSON.stringify(parsed.data.binding) !== JSON.stringify(expected.data)
        )
          unavailable();
        return parsed.data.payload;
      } catch {
        return unavailable();
      }
    },
  };
}
