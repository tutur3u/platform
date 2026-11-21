import { createHash, createPublicKey, verify } from 'node:crypto';
import { z } from 'zod';

// Ingress evidence for registry operations. A principal signature proves
// which workload calls; this proof, signed by the Mira ingress, proves who
// sent the message. It is a separate contract from the Fleet desk event in
// apps/web/src/lib/fleet/desk-event.ts: its own signing domain, its own
// versioned keys from MIRA_INGRESS_PUBLIC_KEYS, and registry operations only.
// The event hash matches the Fleet derivation so both consume the same
// provider event record. See
// apps/docs/platform/features/people-registry.mdx#ingress-evidence.

export const PEOPLE_EVENT_DOMAIN = 'people-registry-event-v1';

export type PeopleRegistryOperation = 'registry.recall' | 'registry.write';

// Conversation types each registry operation accepts. Anything else is
// refused before the database is touched.
const CONVERSATION_TYPES: Record<PeopleRegistryOperation, readonly string[]> = {
  'registry.recall': ['private_1_to_1', 'group'],
  'registry.write': ['private_1_to_1', 'group'],
};

const providerId = z.string().regex(/^[!-~]{1,200}$/);
const kidSchema = z.string().regex(/^[A-Za-z0-9_-]{4,64}$/);
const keysSchema = z.record(
  kidSchema,
  z.string().regex(/^[A-Za-z0-9+/]{43}=$/)
);
const eventSchema = z.strictObject({
  version: z.literal(1),
  kid: kidSchema,
  channel: z.enum(['whatsapp', 'zalo', 'discord']),
  account: providerId,
  sender: providerId,
  conversation: providerId,
  conversationType: z.enum(['private_1_to_1', 'group']),
  eventId: providerId,
  operation: z.enum(['registry.recall', 'registry.write']),
  inputSha256: z.string().regex(/^[0-9a-f]{64}$/),
  issuedAt: z.number().int(),
});

const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

export type PeopleIngressEvent = {
  kid: string;
  channel: 'whatsapp' | 'zalo' | 'discord';
  account: string;
  // Raw provider identifiers stay server-side: they are hashed under the
  // workspace lookup key and never logged or returned.
  sender: string;
  conversation: string;
  conversationType: 'private_1_to_1' | 'group';
  operation: PeopleRegistryOperation;
  eventHash: string;
};

function ingressKey(kid: string, configured: string | undefined) {
  try {
    const keys = keysSchema.parse(JSON.parse(configured ?? '{}'));
    if (!Object.hasOwn(keys, kid)) return null;
    const raw = Buffer.from(keys[kid] as string, 'base64');
    if (raw.length !== 32) return null;
    return createPublicKey({
      key: Buffer.concat([ED25519_SPKI_PREFIX, raw]),
      format: 'der',
      type: 'spki',
    });
  } catch {
    return null;
  }
}

export function verifyPeopleIngressEvent(input: {
  headers: Headers;
  body: Uint8Array;
  operation: PeopleRegistryOperation;
  keys?: string;
  now?: number;
}): PeopleIngressEvent | null {
  const kid = input.headers.get('x-people-event-key-id') ?? '';
  const proof = input.headers.get('x-people-event') ?? '';
  const signature = input.headers.get('x-people-event-signature') ?? '';
  if (
    !kidSchema.safeParse(kid).success ||
    !/^[A-Za-z0-9_-]{1,2048}$/.test(proof) ||
    !/^[A-Za-z0-9_-]{86}$/.test(signature)
  )
    return null;
  const key = ingressKey(
    kid,
    input.keys ?? process.env.MIRA_INGRESS_PUBLIC_KEYS
  );
  if (!key) return null;

  try {
    if (
      !verify(
        null,
        Buffer.from(`${PEOPLE_EVENT_DOMAIN}.${proof}`),
        key,
        Buffer.from(signature, 'base64url')
      )
    )
      return null;
    const event = eventSchema.parse(
      JSON.parse(
        new TextDecoder('utf-8', { fatal: true }).decode(
          Buffer.from(proof, 'base64url')
        )
      )
    );
    const age = (input.now ?? Date.now()) - event.issuedAt;
    if (
      event.kid !== kid ||
      event.operation !== input.operation ||
      !CONVERSATION_TYPES[event.operation].includes(event.conversationType) ||
      age < -30_000 ||
      age > 300_000 ||
      createHash('sha256').update(input.body).digest('hex') !==
        event.inputSha256
    )
      return null;
    return {
      kid,
      channel: event.channel,
      account: event.account,
      sender: event.sender,
      conversation: event.conversation,
      conversationType: event.conversationType,
      operation: event.operation,
      eventHash: createHash('sha256').update(event.eventId).digest('hex'),
    };
  } catch {
    return null;
  }
}
