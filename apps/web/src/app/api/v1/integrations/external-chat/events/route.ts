import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { notifyChatMessageRecipients } from '@/lib/chat/notifications';
import { publishChatRealtimeEvent } from '@/lib/chat/realtime';
import {
  normalizeLegacyExternalChatEvent,
  processExternalChatEnvelope,
} from '@/lib/external-chat/ingest';
import { authenticateExternalChatIngest } from '@/lib/external-chat/ingest-auth';
import {
  type ExternalChatEventEnvelope,
  externalChatEventEnvelopeSchema,
  externalChatEventSchema,
} from '@/lib/external-chat/schemas';
import { safeParseBody } from '@/lib/safe-parse-body';

export async function POST(request: Request) {
  const authentication = await authenticateExternalChatIngest(request);
  if (!authentication)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { state, wsId } = authentication;

  const body = await safeParseBody(request as never, 64 * 1024);
  if (body instanceof NextResponse) return body;
  const envelope = externalChatEventEnvelopeSchema.safeParse(body.data);
  let event: ExternalChatEventEnvelope;
  if (envelope.success) event = envelope.data;
  else {
    const legacy = externalChatEventSchema.safeParse(body.data);
    if (!legacy.success)
      return NextResponse.json({ error: 'Invalid event' }, { status: 400 });
    event = normalizeLegacyExternalChatEvent(legacy.data);
  }

  const result = await processExternalChatEnvelope(event, {
    connectorKey: state.binding.canonical_project_id ?? wsId,
    configurationRevision: state.credentials.configuration_revision,
    settings: state.binding.settings,
    wsId,
  });

  if (
    event.kind === 'message' &&
    event.deliveryMode === 'live' &&
    result.conversation &&
    result.message
  ) {
    const audience = { scope: 'workspace' } as const;
    if (result.conversationCreated || result.duplicate) {
      await publishChatRealtimeEvent({
        actorUserId: null,
        audience,
        conversation: result.conversation,
        conversationId: result.conversation.id,
        type: 'conversation.created',
        wsId,
      });
    }
    await publishChatRealtimeEvent({
      actorUserId: null,
      audience,
      conversationId: result.message.conversationId,
      message: result.message,
      type: 'message.created',
      wsId,
    });
    if (!result.duplicate && event.direction === 'visitor') {
      await notifyChatMessageRecipients({
        actorUserId: null,
        conversation: result.conversation,
        message: result.message,
        wsId,
      });
    }
  }

  const admin = await createAdminClient({ noCookie: true });
  const { error } = await (admin.schema('private') as any)
    .from('external_chat_sync_checkpoints')
    .upsert(
      {
        ingest_checked_at: new Date().toISOString(),
        state: 'ready',
        ws_id: wsId,
      },
      { onConflict: 'ws_id' }
    );
  if (error) console.warn('Failed to update external chat checkpoint', error);

  return NextResponse.json(
    {
      conversationId: result.conversationId,
      duplicate: Boolean(result.duplicate),
      messageId: result.messageId,
      threadId: result.threadId,
    },
    { status: result.duplicate ? 200 : 201 }
  );
}
