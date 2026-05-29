import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
import {
  getAiChatId,
  isAiChatConversationId,
} from '@/lib/chat/agent-discovery';
import {
  type ChatConversation,
  callPrivateChatRpc,
  chatRpcErrorResponse,
  resolveChatRouteContext,
} from '@/lib/chat/private-rpc';
import { serverLogger } from '@/lib/infrastructure/log-drain';

type RouteParams = {
  conversationId: string;
  wsId: string;
};

type AiSettingsRow = {
  auto_reply?: boolean | null;
  conversation_id?: string | null;
  credit_source?: 'personal' | 'workspace' | null;
  credit_ws_id?: string | null;
  enabled?: boolean | null;
  model_id?: string | null;
  system_prompt?: string | null;
  thinking_mode?: 'fast' | 'thinking' | null;
  updated_at?: string | null;
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
    serverLogger.error('Failed to resolve personal workspace for AI settings', {
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
  const { data, error } = await sbAdmin
    .schema('private')
    .from('chat_conversation_ai_settings')
    .select(
      'conversation_id, model_id, system_prompt, auto_reply, enabled, thinking_mode, credit_source, credit_ws_id, updated_at'
    )
    .eq('conversation_id', conversationId)
    .maybeSingle();

  if (error) {
    serverLogger.error('Failed to load native AI chat settings', {
      conversationId,
      error,
    });
  }

  return mapSettingsRow({
    conversationId,
    personalWorkspaceId,
    row: data as unknown as AiSettingsRow | null,
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
  const updatePayload = {
    ...(payload.creditSource !== undefined
      ? { credit_source: payload.creditSource }
      : {}),
    ...(payload.creditWsId !== undefined
      ? { credit_ws_id: payload.creditWsId }
      : {}),
    ...(payload.modelId !== undefined ? { model_id: payload.modelId } : {}),
    ...(payload.systemPrompt !== undefined
      ? { system_prompt: payload.systemPrompt }
      : {}),
    ...(payload.thinkingMode !== undefined
      ? { thinking_mode: payload.thinkingMode }
      : {}),
  };

  const { data, error } = await sbAdmin
    .schema('private')
    .from('chat_conversation_ai_settings')
    .update(updatePayload as never)
    .eq('conversation_id', conversationId)
    .select(
      'conversation_id, model_id, system_prompt, auto_reply, enabled, thinking_mode, credit_source, credit_ws_id, updated_at'
    )
    .maybeSingle();

  if (error) throw error;

  return mapSettingsRow({
    conversationId,
    personalWorkspaceId,
    row: data as unknown as AiSettingsRow | null,
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

function mapSettingsRow({
  conversationId,
  personalWorkspaceId,
  row,
}: {
  conversationId: string;
  personalWorkspaceId: string | null;
  row: AiSettingsRow | null;
}) {
  return {
    autoReply: row?.auto_reply ?? true,
    conversationId,
    creditSource: row?.credit_source ?? 'workspace',
    creditWsId: row?.credit_ws_id ?? null,
    enabled: row?.enabled ?? true,
    modelId: normalizeAiModelId(row?.model_id ?? null),
    personalWorkspaceId,
    systemPrompt: row?.system_prompt ?? null,
    thinkingMode: row?.thinking_mode ?? 'fast',
    updatedAt: row?.updated_at ?? null,
  };
}

function normalizeAiModelId(modelId?: string | null) {
  if (!modelId?.trim()) return 'google/gemini-3-flash';
  const trimmed = modelId.trim();
  return trimmed.includes('/') ? trimmed : `google/${trimmed}`;
}
