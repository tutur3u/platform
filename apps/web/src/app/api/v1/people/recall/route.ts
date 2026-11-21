import { z } from 'zod';
import { verifyPeopleIngressEvent } from '@/lib/people-registry/ingress-event';
import {
  InvalidExternalIdError,
  lookupHash,
  PEOPLE_KEY_PURPOSES,
  unwrapWorkspaceKey,
} from '@/lib/people-registry/keys';
import { machineJson, withPeopleMachine } from '@/lib/people-registry/machine';

// Full recall for a responder principal. The person and conversation come
// from the signed ingress evidence, hashed here under every retained lookup
// key version; the request body carries only cache revalidation. See
// apps/docs/platform/features/people-registry.mdx#service-routes.

const bodySchema = z.strictObject({
  if_version: z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .optional(),
});
const keysSchema = z.array(
  z.object({
    purpose: z.enum(PEOPLE_KEY_PURPOSES),
    version: z.number().int().positive(),
    wrappedKey: z.string(),
    current: z.boolean(),
  })
);
const recallSchema = z.object({
  reason: z.string(),
  personId: z.string().nullable().optional(),
  conversationId: z.string().nullable().optional(),
  versions: z.unknown().optional(),
  etag: z.string().optional(),
  notModified: z.literal(true).optional(),
  snapshot: z.unknown().optional(),
});

const refusals: Record<string, number> = {
  principal_refused: 403,
  scope_denied: 403,
  event_consumed: 409,
};

function parseBody(bytes: Uint8Array) {
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const parsed = bodySchema.safeParse(text ? JSON.parse(text) : {});
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export const POST = withPeopleMachine(
  ['responder'],
  async ({ request, principal, body, rpc }) => {
    const input = parseBody(body);
    if (!input) return machineJson({ error: 'invalid_request' }, 400);
    const evidence = verifyPeopleIngressEvent({
      headers: request.headers,
      body,
      operation: 'registry.recall',
    });
    if (!evidence) return machineJson({ error: 'evidence_refused' }, 401);

    const loaded = await rpc('people_machine_lookup_keys', {
      p_ws: principal.wsId,
      p_principal: principal.principalId,
    });
    const wrapped = keysSchema.safeParse(loaded.data);
    if (loaded.error || !wrapped.success || wrapped.data.length === 0)
      return machineJson({ error: 'registry_unavailable' }, 503);

    let lookups: Record<'sender' | 'conversation', unknown[]>;
    try {
      const hashes = (
        purpose: 'sender_lookup' | 'conversation_lookup',
        externalId: string
      ) =>
        wrapped.data
          .filter((key) => key.purpose === purpose)
          .map((key) => {
            const unwrapped = unwrapWorkspaceKey(principal.wsId, key);
            return {
              version: key.version,
              hash: lookupHash(unwrapped, {
                wsId: principal.wsId,
                channel: evidence.channel,
                account: evidence.account,
                externalId,
              }).toString('hex'),
            };
          });
      lookups = {
        sender: hashes('sender_lookup', evidence.sender),
        conversation: hashes('conversation_lookup', evidence.conversation),
      };
    } catch (error) {
      if (error instanceof InvalidExternalIdError)
        return machineJson({ error: 'evidence_refused' }, 401);
      throw error;
    }

    const recalled = await rpc('people_recall', {
      p_ws: principal.wsId,
      p_principal: principal.principalId,
      p_event: {
        channel: evidence.channel,
        account: evidence.account,
        eventHash: evidence.eventHash,
      },
      p_conversation_type: evidence.conversationType,
      p_sender_lookups: lookups.sender,
      p_conversation_lookups: lookups.conversation,
      p_if_version: input.if_version ?? null,
    });
    if (recalled.error)
      return machineJson({ error: 'registry_unavailable' }, 503);
    const result = recallSchema.safeParse(recalled.data);
    if (!result.success)
      return machineJson({ error: 'registry_unavailable' }, 503);
    if (result.data.reason !== 'ok')
      return machineJson(
        { error: result.data.reason },
        refusals[result.data.reason] ?? 403
      );
    return machineJson({
      person_id: result.data.personId ?? null,
      conversation_id: result.data.conversationId ?? null,
      versions: result.data.versions,
      etag: result.data.etag,
      ...(result.data.notModified
        ? { not_modified: true }
        : { snapshot: result.data.snapshot }),
      // Semantic memory recall belongs to the memory service namespace.
      memories: [],
    });
  }
);
