import { z } from 'zod';
import { scrubFleetText } from './scrub';

/**
 * Shapes of the `secret` decision kind and its answers (Mastermind secret
 * entry, protocol v1). Zod only, with no Node APIs, because the fleet
 * contract is shared with the publisher and the Mastermind web app. Bound
 * fields are validated structurally and never scrubbed: the machine signs
 * them verbatim, so any rewrite would break the signature. Design:
 * apps/docs/build/devops/mastermind-secret-entry.mdx.
 */
export const SECRET_PROTOCOL_VERSION = '1';
/**
 * Request lifetime ceiling, measured from the decision's `createdAt`, with
 * the publisher's one-minute clock allowance, so a request the publisher
 * accepts never fails the whole snapshot here.
 */
export const SECRET_MAX_TTL_MS = 31 * 60 * 1000;
/** New answers stop this long before `expiresAt`, on the server clock. */
export const SECRET_ANSWER_CUTOFF_MS = 15 * 1000;
/** A pairing keeps at most this many answers, each a new revision. */
export const SECRET_PAIR_MAX_REVISIONS = 5;
export const SECRET_MAX_DECISIONS = 10;
const PAD_BLOCK = 256;
const MAX_BLOCKS = 17;
const TAG_BYTES = 16;

const B64URL_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/**
 * Byte length of canonical unpadded base64url text, or null. Canonical
 * means re-encoding the decoded bytes gives the same text: no padding, no
 * impossible length and no stray bits in the last character.
 */
export function b64urlByteLength(text: unknown): number | null {
  if (typeof text !== 'string' || !/^[A-Za-z0-9_-]*$/.test(text)) return null;
  const tail = text.length % 4;
  if (tail === 1) return null;
  if (tail > 0) {
    const last = B64URL_ALPHABET.indexOf(text[text.length - 1]!);
    // Two trailing characters carry 4 spare bits, three carry 2.
    if (last % (tail === 2 ? 16 : 4) !== 0) return null;
  }
  return Math.floor(text.length / 4) * 3 + (tail ? tail - 1 : 0);
}

const b64urlBytes = (length: number) =>
  z
    .string()
    .max(Math.ceil((length * 4) / 3))
    .refine((value) => b64urlByteLength(value) === length, 'b64url');
export const secretKeySchema = b64urlBytes(32);
export const secretSigSchema = b64urlBytes(64);

/** HPKE ciphertext: the padded plaintext (1 to 17 blocks) plus the tag. */
export const secretCiphertextSchema = z
  .string()
  .max(Math.ceil(((MAX_BLOCKS * PAD_BLOCK + TAG_BYTES) * 4) / 3))
  .refine((value) => {
    const bytes = b64urlByteLength(value);
    if (bytes === null) return false;
    const body = bytes - TAG_BYTES;
    return (
      body >= PAD_BLOCK &&
      body % PAD_BLOCK === 0 &&
      body <= MAX_BLOCKS * PAD_BLOCK
    );
  }, 'ciphertext');

/** UTC ISO 8601 with milliseconds and `Z`, as bound into signatures. */
export const secretTimeSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  .refine((value) => {
    const time = Date.parse(value);
    return Number.isFinite(time) && new Date(time).toISOString() === value;
  }, 'time');

const slug = z.string().regex(/^[a-z0-9][a-z0-9._-]{0,63}$/);
export const ownerKeyIdSchema = z.string().regex(/^[0-9a-f]{32}$/);
const CONTROL = new RegExp('[\\u0000-\\u001F\\u007F]');
/** Up to 64 operation arguments plus room for the SSH `--` and quoted line. */
const argList = z
  .array(z.string().refine((arg) => !CONTROL.test(arg)))
  .min(1)
  .max(66);
const commandShape = z
  .object({ argv: argList, remote: argList.optional() })
  .strict();

/** `{"argv":[…]}` or `{"argv":[…],"remote":[…]}` as JSON text, bound verbatim. */
export const secretCommandSchema = z
  .string()
  .min(1)
  .max(8192)
  .refine((value) => {
    try {
      return commandShape.safeParse(JSON.parse(value)).success;
    } catch {
      return false;
    }
  }, 'command');

/** Signed display text must already be what the scrubber would produce. */
const fixedPointText = (max: number) =>
  z
    .string()
    .min(1)
    .max(max)
    .refine((value) => scrubFleetText(value, max) === value, 'scrub');

/** Sorted, comma-joined owner key ids (one to four). */
export const secretAudienceSchema = z
  .string()
  .regex(/^[0-9a-f]{32}(,[0-9a-f]{32}){0,3}$/)
  .refine((value) => {
    const ids = value.split(',');
    return ids.every((id, index) => index === 0 || ids[index - 1]! <= id);
  }, 'audience order');

export const fleetSecretRequestSchema = z.object({
  mode: z.literal('request'),
  v: z.literal(SECRET_PROTOCOL_VERSION),
  requestId: z.string().regex(/^secret-[0-9a-f]{24}$/),
  machineId: slug,
  requester: z.string().regex(/^(lane-[0-9a-f]{16}|terminal)$/),
  operation: slug,
  command: secretCommandSchema,
  output: z.enum(['withheld', 'agent']),
  purpose: fixedPointText(120),
  expiresAt: secretTimeSchema,
  publicKey: secretKeySchema,
  signerKey: secretKeySchema,
  audience: secretAudienceSchema,
  sig: secretSigSchema,
});

export const fleetSecretPairSchema = z.object({
  mode: z.literal('pair'),
  v: z.literal(SECRET_PROTOCOL_VERSION),
  pairingId: z.string().regex(/^pair-[0-9a-f]{24}$/),
  machineId: slug,
  machineLabel: fixedPointText(40),
  signerKey: secretKeySchema,
  expiresAt: secretTimeSchema,
  machineMac: secretKeySchema,
});

export const fleetSecretSchema = z.discriminatedUnion('mode', [
  fleetSecretRequestSchema,
  fleetSecretPairSchema,
]);
export type FleetSecretRequest = z.infer<typeof fleetSecretRequestSchema>;
export type FleetSecretPair = z.infer<typeof fleetSecretPairSchema>;
export type FleetSecret = z.infer<typeof fleetSecretSchema>;

/** The decision id a secret payload signs: its request or pairing id. */
export const fleetSecretId = (secret: FleetSecret) =>
  secret.mode === 'request' ? secret.requestId : secret.pairingId;

export const fleetSecretOutcomes = [
  'delivered',
  'failed',
  'declined',
  'expired',
  'cancelled',
  'paired',
] as const;

/** The machine-signed outcome a resolved secret decision carries. */
export const fleetSecretOutcomeSchema = z.object({
  outcome: z.enum(fleetSecretOutcomes),
  answerDigest: z.string().regex(/^([0-9a-f]{64}|[0-9a-f]{32})?$/),
  sig: secretSigSchema,
});

export const fleetSecretActions = ['secret', 'decline', 'pair'] as const;
export type FleetSecretAction = (typeof fleetSecretActions)[number];
export const isFleetSecretAction = (
  action: string
): action is FleetSecretAction =>
  (fleetSecretActions as readonly string[]).includes(action);

export const fleetSealedSchema = z
  .object({ enc: secretKeySchema, ct: secretCiphertextSchema })
  .strict();
export const fleetOwnerProofSchema = z
  .object({
    publicKey: secretKeySchema,
    keyId: ownerKeyIdSchema,
    signedAt: secretTimeSchema,
    sig: secretSigSchema,
  })
  .strict();
export const fleetPairAnswerSchema = z
  .object({ ownerKey: secretKeySchema, ownerMac: secretKeySchema })
  .strict();

/** Which payload fields each answer action carries; others carry none. */
export function secretPayloadMatches(input: {
  action: string;
  optionId?: string;
  text?: string;
  sealed?: unknown;
  owner?: unknown;
  pair?: unknown;
}) {
  const has = {
    sealed: !!input.sealed,
    owner: !!input.owner,
    pair: !!input.pair,
  };
  switch (input.action) {
    case 'secret':
      return (
        has.sealed && has.owner && !has.pair && !input.optionId && !input.text
      );
    case 'decline':
      return (
        !has.sealed && has.owner && !has.pair && !input.optionId && !input.text
      );
    case 'pair':
      return (
        !has.sealed && !has.owner && has.pair && !input.optionId && !input.text
      );
    default:
      return !has.sealed && !has.owner && !has.pair;
  }
}
