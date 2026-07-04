import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
import {
  getAiChatId,
  isAiChatConversationId,
} from '@/lib/chat/agent-discovery';
import {
  buildFullChatAiSettingsUpdatePayload,
  buildLegacyChatAiSettingsUpdatePayload,
  CHAT_AI_SETTINGS_FULL_SELECT,
  CHAT_AI_SETTINGS_LEGACY_SELECT,
  type ChatAiSettingsRow,
  ChatAiSettingsSchemaCacheStaleError,
  hasNewChatAiSettingsPatchFields,
  isChatAiSettingsSchemaCacheError,
  mapChatAiSettingsRow,
  normalizeAiModelId,
  serializeChatAiSettingsDbError,
} from '@/lib/chat/ai-settings';
import {
  type ChatConversation,
  callPrivateChatRpc,
  chatRpcErrorResponse,
  resolveChatRouteContext,
} from '@/lib/chat/private-rpc';

type RouteParams = {
  conversationId: string;
  wsId: string;
};

const updateSettingsSchema = z.object({
  creditSource: z.enum(['personal', 'workspace']).optional(),
  creditWsId: z.string().uuid().nullable().optional(),
  modelId: z.string().trim().min(1).max(255).nullable().optional(),
  systemPrompt: z.string().trim().max(10000).nullable().optional(),
  thinkingMode: z.enum(['fast', 'thinking']).optional(),
});

export const GET = withSessionAuth<RouteParams>(
  async (_request: NextRequest, auth, params) => {
    const context = await resolveChatRouteContext({
      auth,
      permission: 'view_chat',
      wsId: params.wsId,
    });
    if (!context.ok) return context.response;

    try {
      const personalWorkspaceId = await getPersonalWorkspaceId(auth.user.id);

      if (isAiChatConversationId(params.conversationId)) {
        const settings = await getAiChatSettings({
          conversationId: params.conversationId,
          personalWorkspaceId,
          userId: auth.user.id,
        });
        if (!settings) {
          return NextResponse.json(
            { message: 'Chat not found' },
            { status: 404 }
          );
        }

        return NextResponse.json({ settings });
      }

      const conversation = await callPrivateChatRpc<ChatConversation>(
        'chat_get_conversation',
        {
          p_actor_user_id: auth.user.id,
          p_conversation_id: params.conversationId,
          p_ws_id: context.context.normalizedWsId,
        }
      );

      if (conversation?.type !== 'ai') {
        return NextResponse.json(
          { message: 'Conversation is not an AI chat' },
          { status: 400 }
        );
      }

      const settings = await getNativeAiSettings({
        conversationId: conversation.id,
        personalWorkspaceId,
      });

      return NextResponse.json({ settings });
    } catch (error) {
      return chatRpcErrorResponse(error, 'Failed to load AI chat settings');
    }
  },
  { allowAppSessionAuth: true, rateLimitKind: 'read' }
);

export const PATCH = withSessionAuth<RouteParams>(
  async (request: NextRequest, auth, params) => {
    const context = await resolveChatRouteContext({
      auth,
      permission: 'view_chat',
      wsId: params.wsId,
    });
    if (!context.ok) return context.response;

    if (context.context.permissions.withoutPermission('manage_chat')) {
      return NextResponse.json(
        { message: 'Insufficient chat permissions' },
        { status: 403 }
      );
    }

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return NextResponse.json(
        { message: 'Invalid request body' },
        { status: 400 }
      );
    }

    const parsed = updateSettingsSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        { message: 'Invalid request body', errors: parsed.error.issues },
        { status: 400 }
      );
    }

    try {
      const personalWorkspaceId = await getPersonalWorkspaceId(auth.user.id);

      if (isAiChatConversationId(params.conversationId)) {
        const settings = await updateAiChatSettings({
          conversationId: params.conversationId,
          payload: parsed.data,
          personalWorkspaceId,
          userId: auth.user.id,
        });
        if (!settings) {
          return NextResponse.json(
            { message: 'Chat not found' },
            { status: 404 }
          );
        }

        return NextResponse.json({ settings });
      }

      const conversation = await callPrivateChatRpc<ChatConversation>(
        'chat_get_conversation',
        {
          p_actor_user_id: auth.user.id,
          p_conversation_id: params.conversationId,
          p_ws_id: context.context.normalizedWsId,
        }
      );

      if (conversation?.type !== 'ai') {
        return NextResponse.json(
          { message: 'Conversation is not an AI chat' },
          { status: 400 }
        );
      }

      const settings = await updateNativeAiSettings({
        conversationId: conversation.id,
        payload: parsed.data,
        personalWorkspaceId,
      });

      return NextResponse.json({ settings });
    } catch (error) {
      if (error instanceof ChatAiSettingsSchemaCacheStaleError) {
        return NextResponse.json(
          {
            code: error.code,
            message:
              'Chat AI settings schema is still reloading. Try again shortly.',
          },
          { headers: { 'Retry-After': '10' }, status: 503 }
        );
      }

      return chatRpcErrorResponse(error, 'Failed to update AI chat settings');
    }
  },
  { allowAppSessionAuth: true }
);

async function getPersonalWorkspaceId(userId: string) {
  const sbAdmin = await createAdminClient({ noCookie: true });
  const { data, error } = await sbAdmin
    .from('workspaces')
    .select('id, workspace_members!inner(user_id)')
    .eq('personal', true)
    .eq('workspace_members.user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('Failed to resolve personal workspace for AI settings', {
      error,
      userId,
    });
  }

  return data?.id ?? null;
}

async function getNativeAiSettings({
  conversationId,
  personalWorkspaceId,
}: {
  conversationId: string;
  personalWorkspaceId: string | null;
}) {
  const sbAdmin = await createAdminClient({ noCookie: true });
  const fullResult = await sbAdmin
    .schema('private')
    .from('chat_conversation_ai_settings')
    .select(CHAT_AI_SETTINGS_FULL_SELECT)
    .eq('conversation_id', conversationId)
    .maybeSingle();
  let data = fullResult.data as unknown as ChatAiSettingsRow | null;
  let error = fullResult.error;

  if (error && isChatAiSettingsSchemaCacheError(error)) {
    console.warn('Chat AI settings schema cache stale on read', {
      conversationId,
      error: serializeChatAiSettingsDbError(error),
    });

    const legacyResult = await sbAdmin
      .schema('private')
      .from('chat_conversation_ai_settings')
      .select(CHAT_AI_SETTINGS_LEGACY_SELECT)
      .eq('conversation_id', conversationId)
      .maybeSingle();
    data = legacyResult.data as unknown as ChatAiSettingsRow | null;
    error = legacyResult.error;
  }

  if (error) {
    console.error('Failed to load native AI chat settings', {
      conversationId,
      error: serializeChatAiSettingsDbError(error),
    });
  }

  return mapChatAiSettingsRow({
    conversationId,
    personalWorkspaceId,
    row: data,
  });
}

async function updateNativeAiSettings({
  conversationId,
  payload,
  personalWorkspaceId,
}: {
  conversationId: string;
  payload: z.infer<typeof updateSettingsSchema>;
  personalWorkspaceId: string | null;
}) {
  const sbAdmin = await createAdminClient({ noCookie: true });
  const updatePayload = buildFullChatAiSettingsUpdatePayload(payload);

  const fullResult = await sbAdmin
    .schema('private')
    .from('chat_conversation_ai_settings')
    .update(updatePayload as never)
    .eq('conversation_id', conversationId)
    .select(CHAT_AI_SETTINGS_FULL_SELECT)
    .maybeSingle();

  let data = fullResult.data as unknown as ChatAiSettingsRow | null;
  let error = fullResult.error;

  if (error && isChatAiSettingsSchemaCacheError(error)) {
    console.warn('Chat AI settings schema cache stale on update', {
      conversationId,
      error: serializeChatAiSettingsDbError(error),
      payloadFields: Object.keys(updatePayload),
    });

    if (hasNewChatAiSettingsPatchFields(payload)) {
      throw new ChatAiSettingsSchemaCacheStaleError();
    }

    const legacyPayload = buildLegacyChatAiSettingsUpdatePayload(payload);

    if (Object.keys(legacyPayload).length === 0) {
      return getNativeAiSettings({ conversationId, personalWorkspaceId });
    }

    const legacyResult = await sbAdmin
      .schema('private')
      .from('chat_conversation_ai_settings')
      .update(legacyPayload as never)
      .eq('conversation_id', conversationId)
      .select(CHAT_AI_SETTINGS_LEGACY_SELECT)
      .maybeSingle();
    data = legacyResult.data as unknown as ChatAiSettingsRow | null;
    error = legacyResult.error;
  }

  if (error) throw error;

  return mapChatAiSettingsRow({
    conversationId,
    personalWorkspaceId,
    row: data,
  });
}

async function getAiChatSettings({
  conversationId,
  personalWorkspaceId,
  userId,
}: {
  conversationId: string;
  personalWorkspaceId: string | null;
  userId: string;
}) {
  const chatId = getAiChatId(conversationId);
  if (!chatId) return null;

  const sbAdmin = await createAdminClient({ noCookie: true });
  const { data, error } = await sbAdmin
    .from('ai_chats')
    .select('id, model')
    .eq('id', chatId)
    .eq('creator_id', userId)
    .maybeSingle();

  if (error || !data) return null;

  return {
    autoReply: true,
    conversationId,
    creditSource: 'workspace' as const,
    creditWsId: null,
    enabled: true,
    modelId: normalizeAiModelId(data.model),
    personalWorkspaceId,
    systemPrompt: null,
    thinkingMode: 'fast' as const,
    updatedAt: null,
  };
}

async function updateAiChatSettings({
  conversationId,
  payload,
  personalWorkspaceId,
  userId,
}: {
  conversationId: string;
  payload: z.infer<typeof updateSettingsSchema>;
  personalWorkspaceId: string | null;
  userId: string;
}) {
  const chatId = getAiChatId(conversationId);
  if (!chatId) return null;

  const sbAdmin = await createAdminClient({ noCookie: true });
  if (payload.modelId !== undefined) {
    const { error } = await sbAdmin
      .from('ai_chats')
      .update({ model: payload.modelId })
      .eq('id', chatId)
      .eq('creator_id', userId);

    if (error) throw error;
  }

  return getAiChatSettings({ conversationId, personalWorkspaceId, userId });
}
