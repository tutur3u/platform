import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { processExternalChatEnvelope } from '@/lib/external-chat/ingest';
import { authenticateExternalChatIngest } from '@/lib/external-chat/ingest-auth';
import { externalChatBatchSchema } from '@/lib/external-chat/schemas';
import { digestExternalChatBatch } from '@/lib/external-chat/store';
import { safeParseBody } from '@/lib/safe-parse-body';

export async function POST(request: Request) {
  const authentication = await authenticateExternalChatIngest(request);
  if (!authentication)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await safeParseBody(request as never, 1024 * 1024);
  if (body instanceof NextResponse) return body;
  const parsed = externalChatBatchSchema.safeParse(body.data);
  if (
    !parsed.success ||
    parsed.data.events.some((event) => event.deliveryMode === 'live')
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
  for (const event of parsed.data.events)
    results.push(await processExternalChatEnvelope(event, context));

  const admin = await createAdminClient({ noCookie: true });
  const { error } = await (admin.schema('private') as any)
    .from('external_chat_stream_cursors')
    .upsert(
      {
        connector_key: context.connectorKey,
        cursor: parsed.data.cursor ?? {},
        high_water_mark: parsed.data.highWaterMark ?? {},
        last_error_code: null,
        retry_count: 0,
        stream_key: 'historical-events',
        updated_at: new Date().toISOString(),
        ws_id: wsId,
      },
      { onConflict: 'ws_id,connector_key,stream_key' }
    );
  if (error) throw new Error(error.message);

  return NextResponse.json({
    accepted: results.length,
    digest: digestExternalChatBatch(parsed.data.events),
    duplicates: results.filter((result) => result.duplicate).length,
  });
}
