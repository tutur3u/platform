import {
  fleetIntentInputSchema,
  fleetIntentReceiptSchema,
} from '@tuturuuu/internal-api/fleet';
import { connection, type NextRequest } from 'next/server';
import { z } from 'zod';
import { scrubFleetText } from '@/lib/mastermind/fleet/scrub';
import {
  authenticateFleetDesk,
  fleetDeskDenied,
  isFleetDeskRequest,
  verifyFleetDeskEvent,
} from '../desk-event';
import { getFleetIntentDb } from '../intent-db';
import { fleetUnavailable, parseFleetRequest } from '../intent-request';
import { fleetJson, withFleetSession } from '../session';

async function submit(
  request: Request,
  principal:
    | { actorId: string }
    | { desk: NonNullable<ReturnType<typeof authenticateFleetDesk>> }
) {
  const parsed = await parseFleetRequest(request, fleetIntentInputSchema);
  if (parsed.error) return parsed.error;

  const event =
    'desk' in principal
      ? verifyFleetDeskEvent(
          request,
          principal.desk,
          parsed.bytes,
          'intent.submit'
        )
      : null;
  if ('desk' in principal && !event) return fleetDeskDenied();

  const { kind, payload, quote } = parsed.data;
  const { projectKey, ...details } = payload;
  const { targetKey, ...parameters } =
    'targetKey' in details ? details : { ...details, targetKey: null };
  const redactedQuote = quote
    ? scrubFleetText(quote, 1000)
        .replace(/(?:\+?\d[ .()-]*){8,}/g, ' ')
        .replace(/\s+/g, ' ')
        .trim() || '[redacted]'
    : undefined;

  try {
    const db = await getFleetIntentDb();
    const { data, error } = await db
      .rpc('fleet_submit_resolved_intent', {
        p_kind: kind,
        p_project_key: projectKey,
        // Generated RPC args type every text parameter as non-null. A
        // status question has no target, and the function resolves it by
        // project alone (covered by fleet-desk-admission.sql).
        p_target_key: targetKey as string,
        p_parameters: parameters,
        ...('actorId' in principal
          ? { p_actor_id: principal.actorId }
          : { p_event: event }),
        p_redacted_quote: redactedQuote,
      })
      .single();

    if (error || !data) return fleetUnavailable();

    const reason = data.reason_code;
    switch (reason) {
      case 'accepted': {
        const id = z.uuid().safeParse(data.intent_id);
        return id.success
          ? fleetJson({ id: id.data }, 201)
          : fleetUnavailable();
      }
      case 'unauthorized_desk_event':
        return fleetDeskDenied();
      case 'questions_per_hour':
      case 'intents_per_day':
        return fleetJson({ error: reason }, 429);
      case 'event_replayed':
      case 'stale_project_mapping':
        return fleetJson({ error: reason }, 409);
      case 'fleet_stopped':
      case 'inactive_grant':
      case 'missing_capability':
      case 'project_outside_grant':
      case 'unlinked_identity':
        return fleetJson({ error: reason }, 403);
      default:
        return fleetUnavailable();
    }
  } catch {
    return fleetUnavailable();
  }
}

const submitWithSession = withFleetSession(
  (actorId, request) => submit(request, { actorId }),
  'mastermind'
);

export async function POST(request: NextRequest) {
  if (!isFleetDeskRequest(request)) return submitWithSession(request);
  await connection();
  const desk = authenticateFleetDesk(request);
  return desk ? submit(request, { desk }) : fleetDeskDenied();
}

export const GET = withFleetSession(async (actorId, request) => {
  const cursor = z
    .uuid()
    .nullable()
    .safeParse(request.nextUrl.searchParams.get('before'));
  if (!cursor.success) return fleetJson({ error: 'invalid_cursor' }, 400);

  try {
    const db = await getFleetIntentDb();
    const { data, error } = await db.rpc('fleet_list_intents', {
      p_actor_id: actorId,
      p_before: cursor.data ?? undefined,
    });
    if (error) return fleetUnavailable();
    if (data === null) return fleetJson({ error: 'forbidden' }, 403);

    const receipts = z.array(fleetIntentReceiptSchema).max(51).safeParse(data);
    if (!receipts.success) return fleetUnavailable();
    const intents = receipts.data.slice(0, 50);
    return fleetJson({
      intents,
      nextBefore: receipts.data.length > 50 ? intents.at(-1)?.id : null,
    });
  } catch {
    return fleetUnavailable();
  }
});
