import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { Effect, forEachConcurrently } from '@tuturuuu/utils/effect';
import { NextResponse } from 'next/server';
import { processExternalChatEnvelope } from '@/lib/external-chat/ingest';
import { authenticateExternalChatIngest } from '@/lib/external-chat/ingest-auth';
import { externalChatBatchSchema } from '@/lib/external-chat/schemas';
import { digestExternalChatBatch } from '@/lib/external-chat/source-events';
import { safeParseBody } from '@/lib/safe-parse-body';

const HISTORICAL_BATCH_CONCURRENCY = 8;

export async function POST(request: Request) {
  const authentication = await authenticateExternalChatIngest(request);
  if (!authentication)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await safeParseBody(request as never, 1024 * 1024);
  if (body instanceof NextResponse) return body;
  const parsed = externalChatBatchSchema.safeParse(body.data);
  if (
    !parsed.success ||
    parsed.data.events.some((event) => event.deliveryMode !== 'historical')
  )
    return NextResponse.json(
      { error: 'Invalid historical batch' },
      { status: 400 }
    );

  const { state, wsId } = authentication;
  const context = {
    configurationRevision: state.credentials.configuration_revision,
    connectorKey: state.binding.canonical_project_id ?? wsId,
    settings: state.binding.settings,
    wsId,
  };
  const results = [];
  const failures: Array<{ code: string; eventId: string }> = [];
  type HistoricalEvent = (typeof parsed.data.events)[number];
  type HistoricalOutcome = {
    event: HistoricalEvent;
    index: number;
  } & (
    | {
        ok: true;
        result: Awaited<ReturnType<typeof processExternalChatEnvelope>>;
      }
    | { ok: false }
  );
  const lanes = new Map<
    string,
    Array<{ event: HistoricalEvent; index: number }>
  >();
  parsed.data.events.forEach((event, index) => {
    const laneKey = `${event.agentId}:${event.visitorId}`;
    const lane = lanes.get(laneKey) ?? [];
    lane.push({ event, index });
    lanes.set(laneKey, lane);
  });
  const laneOutcomes = await Effect.runPromise(
    forEachConcurrently(
      lanes.values(),
      (lane) =>
        Effect.promise(async () => {
          const outcomes: HistoricalOutcome[] = [];
          for (const item of lane) {
            try {
              outcomes.push({
                ...item,
                ok: true,
                result: await processExternalChatEnvelope(item.event, context),
              });
            } catch (error) {
              console.error('External chat historical event import failed', {
                error,
                eventId: item.event.eventId,
                wsId,
              });
              outcomes.push({ ...item, ok: false });
            }
          }
          return outcomes;
        }),
      { concurrency: HISTORICAL_BATCH_CONCURRENCY }
    )
  );
  for (const outcome of laneOutcomes.flat().sort((a, b) => a.index - b.index)) {
    if (!outcome.ok) {
      failures.push({
        code: 'event_import_failed',
        eventId: outcome.event.eventId,
      });
    } else if (outcome.result.conflict) {
      failures.push({
        code: 'external_chat_event_payload_mismatch',
        eventId: outcome.event.eventId,
      });
    } else if (outcome.result.deferred) {
      failures.push({
        code: 'external_chat_event_deferred',
        eventId: outcome.event.eventId,
      });
    } else {
      results.push(outcome.result);
    }
  }

  const admin = await createAdminClient({ noCookie: true });
  const { error } = await (admin.schema('private') as any)
    .from('external_chat_stream_cursors')
    .upsert(
      {
        connector_key: context.connectorKey,
        ...(failures.length === 0 && parsed.data.cursor
          ? { cursor: parsed.data.cursor }
          : {}),
        ...(failures.length === 0 && parsed.data.highWaterMark
          ? { high_water_mark: parsed.data.highWaterMark }
          : {}),
        last_error_code: failures.length > 0 ? 'batch_partial_failure' : null,
        retry_count: failures.length > 0 ? 1 : 0,
        stream_key: 'historical-events',
        updated_at: new Date().toISOString(),
        ws_id: wsId,
      },
      { onConflict: 'ws_id,connector_key,stream_key' }
    );
  if (error) throw new Error(error.message);

  return NextResponse.json(
    {
      accepted: results.length,
      digest: digestExternalChatBatch(parsed.data.events),
      duplicates: results.filter((result) => result.duplicate).length,
      failed: failures.length,
      failures,
    },
    { status: failures.length > 0 ? 207 : 200 }
  );
}
