// Trusted-ingress desk event contract shared by Fleet access and other desk
// consumers. See apps/docs/reference/api-reference/fleet-access.mdx.
import {
  createHash,
  createHmac,
  createPublicKey,
  timingSafeEqual,
  verify,
} from 'node:crypto';
import { z } from 'zod';

const deskBearer =
  /^Bearer (ttr_fleet_desk_([a-z0-9-]{1,40})\.[A-Za-z0-9_-]{43})$/i;
const sha256 = z.string().regex(/^[0-9a-f]{64}$/);
const providerId = z.string().regex(/^[!-~]{1,200}$/);
const deskIdSchema = z.string().regex(/^[a-z0-9-]{1,40}$/);
const credentialVersion = z.number().int().min(1).max(2147483647);
const deskConfigSchema = z.strictObject({
  tokenSha256: sha256,
  ingressPublicKey: z.string().min(1).max(512),
  credentialVersion,
});
const desksSchema = z.record(deskIdSchema, deskConfigSchema);
const eventSchema = z.strictObject({
  version: z.literal(2),
  deskId: deskIdSchema,
  credentialVersion,
  ownerGeneration: z.string().regex(/^[1-9][0-9]{0,18}$/),
  channel: z.enum(['whatsapp', 'zalo', 'discord']),
  account: providerId,
  sender: providerId,
  conversation: providerId,
  conversationType: z.literal('private_1_to_1'),
  eventId: providerId,
  operation: z.enum(['identity.verify', 'intent.submit', 'digest.read']),
  inputSha256: sha256,
  issuedAt: z.number().int(),
});

export function isFleetDeskRequest(request: Request) {
  return /^Bearer ttr_fleet_desk_/i.test(
    request.headers.get('authorization') ?? ''
  );
}

export function authenticateFleetDesk(request: Request) {
  const match = deskBearer.exec(request.headers.get('authorization') ?? '');
  const token = match?.[1];
  const deskId = match?.[2];
  if (!token || !deskId) return null;
  try {
    const desks = desksSchema.parse(
      JSON.parse(process.env.FLEET_DESKS ?? '{}')
    );
    if (!Object.hasOwn(desks, deskId)) return null;
    const desk = desks[deskId];
    if (!desk) return null;
    const actual = createHash('sha256').update(token).digest();
    return timingSafeEqual(actual, Buffer.from(desk.tokenSha256, 'hex'))
      ? { ...desk, bearerDeskId: deskId, signingDeskId: deskId }
      : null;
  } catch {
    return null;
  }
}

export function verifyFleetDeskEvent(
  request: Request,
  desk: NonNullable<ReturnType<typeof authenticateFleetDesk>>,
  body: Uint8Array,
  operation: z.infer<typeof eventSchema>['operation']
) {
  const proof = request.headers.get('x-fleet-event') ?? '';
  const signature = request.headers.get('x-fleet-event-signature') ?? '';
  const hashingKey = process.env.FLEET_IDENTITY_HMAC_KEY;
  if (!hashingKey || !sha256.safeParse(hashingKey).success) return null;
  if (
    !/^[A-Za-z0-9_-]{1,2048}$/.test(proof) ||
    !/^[A-Za-z0-9_-]{86}$/.test(signature)
  ) {
    return null;
  }

  try {
    const key = createPublicKey(desk.ingressPublicKey);
    if (
      key.asymmetricKeyType !== 'ed25519' ||
      !verify(
        null,
        Buffer.from(`fleet-event-v2.${proof}`),
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
    const age = Date.now() - event.issuedAt;
    if (
      event.operation !== operation ||
      age < -30_000 ||
      age > 300_000 ||
      createHash('sha256').update(body).digest('hex') !== event.inputSha256
    )
      return null;

    const identityHash = (domain: string, value: string) =>
      createHmac('sha256', Buffer.from(hashingKey, 'hex'))
        .update(JSON.stringify([domain, event.channel, event.account, value]))
        .digest('hex');

    return {
      channel: event.channel,
      account: event.account,
      version: event.version,
      conversationType: event.conversationType,
      operation: event.operation,
      bearerDeskId: desk.bearerDeskId,
      signingDeskId: desk.signingDeskId,
      signingCredentialVersion: desk.credentialVersion,
      deskId: event.deskId,
      credentialVersion: event.credentialVersion,
      ownerGeneration: event.ownerGeneration,
      senderHash: identityHash('sender', event.sender),
      conversationHash: identityHash('conversation', event.conversation),
      eventHash: createHash('sha256').update(event.eventId).digest('hex'),
    };
  } catch {
    return null;
  }
}
