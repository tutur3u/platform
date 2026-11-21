import { z } from 'zod';
import { verifyPeopleIngressEvent } from '@/lib/people-registry/ingress-event';
import { InvalidExternalIdError } from '@/lib/people-registry/keys';
import {
  machineJson,
  parseMachineBody,
  withPeopleMachine,
} from '@/lib/people-registry/machine';
import { deriveEvidenceLookups } from '@/lib/people-registry/machine-lookups';

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

export const POST = withPeopleMachine(
  ['responder'],
  async ({ request, principal, body, rpc }) => {
    const input = parseMachineBody(body, bodySchema);
    if (!input) return machineJson({ error: 'invalid_request' }, 400);
    const evidence = verifyPeopleIngressEvent({
      headers: request.headers,
      body,
      operation: 'registry.recall',
    });
    if (!evidence) return machineJson({ error: 'evidence_refused' }, 401);

    let lookups: Awaited<ReturnType<typeof deriveEvidenceLookups>>;
    try {
      lookups = await deriveEvidenceLookups(rpc, principal, evidence);
    } catch (error) {
      if (error instanceof InvalidExternalIdError)
        return machineJson({ error: 'evidence_refused' }, 401);
      throw error;
    }
    if (!lookups) return machineJson({ error: 'registry_unavailable' }, 503);

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
