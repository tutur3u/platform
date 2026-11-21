import { z } from 'zod';
import { verifyPeopleIngressEvent } from '@/lib/people-registry/ingress-event';
import { InvalidExternalIdError } from '@/lib/people-registry/keys';
import {
  machineJson,
  parseMachineBody,
  withPeopleMachine,
} from '@/lib/people-registry/machine';
import { deriveCaptureMaterial } from '@/lib/people-registry/machine-capture';
import { deriveEvidenceLookups } from '@/lib/people-registry/machine-lookups';
import { sha256Hex } from '@/lib/people-registry/request-signature';

// The write bundle for one provider event. The person and conversation come
// from the signed ingress evidence; the body names what to record. A retry of
// the same body returns the original receipt. A labelled observation of an
// unknown sender proposes a new person when capture allows it; the capture
// material is derived here and never comes from the caller. See
// apps/docs/platform/features/people-registry.mdx#service-routes.

const bodySchema = z.strictObject({
  items: z
    .array(
      z.strictObject({
        type: z.literal('observe_sender'),
        label: z.string().trim().min(1).max(200).optional(),
      })
    )
    .length(1),
});
const receiptSchema = z.object({
  reason: z.string(),
  items: z.array(z.object({ type: z.string(), result: z.string() })).optional(),
  replayed: z.literal(true).optional(),
});

const refusals: Record<string, number> = {
  principal_refused: 403,
  scope_denied: 403,
  event_consumed: 409,
  unknown_sender: 422,
  consent_required: 422,
  deleting: 409,
  suppressed: 409,
};

export const POST = withPeopleMachine(
  ['responder'],
  async ({ request, principal, body, rpc }) => {
    const input = parseMachineBody(body, bodySchema);
    if (!input) return machineJson({ error: 'invalid_request' }, 400);
    const evidence = verifyPeopleIngressEvent({
      headers: request.headers,
      body,
      operation: 'registry.write',
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
    const resolved = lookups;
    const items = await Promise.all(
      input.items.map(async (item) => {
        if (!item.label) return item;
        const capture = await deriveCaptureMaterial(
          rpc,
          principal,
          evidence,
          resolved
        );
        return capture ? { ...item, capture } : item;
      })
    );

    const written = await rpc('people_write_event', {
      p_ws: principal.wsId,
      p_principal: principal.principalId,
      p_event: {
        channel: evidence.channel,
        account: evidence.account,
        eventHash: evidence.eventHash,
      },
      p_input_sha256: sha256Hex(body),
      p_conversation_type: evidence.conversationType,
      p_sender_lookups: lookups.sender,
      p_conversation_lookups: lookups.conversation,
      p_conversation_current: lookups.conversationCurrent,
      p_items: items,
    });
    if (written.error)
      return machineJson({ error: 'registry_unavailable' }, 503);
    const receipt = receiptSchema.safeParse(written.data);
    if (!receipt.success)
      return machineJson({ error: 'registry_unavailable' }, 503);
    if (receipt.data.reason !== 'ok')
      return machineJson(
        {
          error: receipt.data.reason,
          ...(receipt.data.replayed ? { replayed: true } : {}),
        },
        refusals[receipt.data.reason] ?? 403
      );
    return machineJson({
      items: receipt.data.items ?? [],
      ...(receipt.data.replayed ? { replayed: true } : {}),
    });
  }
);
