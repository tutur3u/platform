import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { notifyChatMessageRecipients } from '@/lib/chat/notifications';
import { publishChatRealtimeEvent } from '@/lib/chat/realtime';
import { verifyExternalChatSecret } from '@/lib/external-chat/crypto';
import {
  externalChatEventSchema,
  isExternalChatLiveAuthority,
} from '@/lib/external-chat/schemas';
import {
  importExternalChatEvent,
  readExternalChatBinding,
} from '@/lib/external-chat/store';
import { safeParseBody } from '@/lib/safe-parse-body';

export async function POST(request: Request) {
  const wsId = request.headers.get('x-external-binding-id');
  const authorization = request.headers.get('authorization');
  const secret = authorization?.startsWith('Bearer ')
    ? authorization.slice(7)
    : null;
  if (!wsId || !z.string().uuid().safeParse(wsId).success || !secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const state = await readExternalChatBinding(wsId);
  const expectedHash = state?.credentials?.ingest_secret_hash;
  const pendingHash =
    state?.credentials?.pending_action === 'set_ingest'
      ? state.credentials.pending_secret_hash
      : null;
  const secretMatches = Boolean(
    (expectedHash && verifyExternalChatSecret(secret, expectedHash)) ||
      (pendingHash && verifyExternalChatSecret(secret, pendingHash))
  );
  if (
    !state?.binding.is_enabled ||
    !isExternalChatLiveAuthority(state.binding.settings) ||
    !state.credentials?.verified_at ||
    !expectedHash ||
    !secretMatches
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await safeParseBody(request as never, 64 * 1024);
  if (body instanceof NextResponse) return body;
  const parsed = externalChatEventSchema.safeParse(body.data);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid event', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const result = await importExternalChatEvent({
    connectorKey: state.binding.canonical_project_id ?? wsId,
    event: parsed.data,
    mappedUserId: getRoutingUserId(
      state.binding.settings,
      parsed.data.agentId,
      parsed.data.direction
    ),
    configurationRevision: state.credentials.configuration_revision,
    wsId,
  });

  if (result.conversation && result.message) {
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
    if (!result.duplicate && parsed.data.direction === 'visitor') {
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
      duplicate: result.duplicate,
      messageId: result.messageId,
      threadId: result.threadId,
    },
    { status: result.duplicate ? 200 : 201 }
  );
}

function getRoutingUserId(
  settings: unknown,
  agentId: string,
  direction: 'staff' | 'system' | 'visitor'
) {
  if (!settings || typeof settings !== 'object') return null;
  const chat = (settings as Record<string, unknown>).chat;
  if (!chat || typeof chat !== 'object') return null;
  const mappings = (chat as Record<string, unknown>).agentMappings;
  const mapped =
    mappings && typeof mappings === 'object' && !Array.isArray(mappings)
      ? (mappings as Record<string, unknown>)[agentId]
      : null;
  if (
    typeof mapped === 'string' &&
    z.string().uuid().safeParse(mapped).success
  ) {
    return mapped;
  }
  if (direction !== 'visitor') return null;

  const inboxDefaults = (chat as Record<string, unknown>).inboxDefaults;
  if (
    !inboxDefaults ||
    typeof inboxDefaults !== 'object' ||
    Array.isArray(inboxDefaults)
  ) {
    return null;
  }
  const recipientUserId = (inboxDefaults as Record<string, unknown>)
    .recipientUserId;
  return typeof recipientUserId === 'string' &&
    z.string().uuid().safeParse(recipientUserId).success
    ? recipientUserId
    : null;
}
