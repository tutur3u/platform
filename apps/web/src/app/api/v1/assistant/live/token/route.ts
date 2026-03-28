import { Modality, ThinkingLevel } from '@google/genai';
import { createClient } from '@tuturuuu/supabase/next/server';
import {
  getWorkspaceTier,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { isFeatureAvailable } from '@/lib/feature-tiers';
import {
  ensureAssistantLiveChat,
  loadAssistantLiveSeedHistory,
} from '@/lib/live/assistant-history';
import {
  ASSISTANT_LIVE_MODEL,
  ASSISTANT_LIVE_TOOL_CONFIG,
  ASSISTANT_LIVE_TOOL_DECLARATIONS,
  ASSISTANT_SYSTEM_INSTRUCTION,
} from '@/lib/live/assistant-tools';
import { assistantChatScopeKey } from '@/lib/live/session-scope';
import { createConstrainedLiveToken } from '@/lib/live/token-builder';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { wsId, chatId, model } = body as {
      wsId?: string;
      chatId?: string;
      model?: string;
    };

    if (!wsId) {
      return Response.json(
        { error: 'Missing wsId parameter' },
        { status: 400 }
      );
    }

    const supabase = await createClient(request);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const normalizedWsId = await normalizeWorkspaceId(wsId);
    const { error: membershipError } = await supabase
      .from('workspace_members')
      .select('user_id')
      .eq('ws_id', normalizedWsId)
      .eq('user_id', user.id)
      .single();

    if (membershipError) {
      return Response.json(
        { error: 'You are not a member of this workspace' },
        { status: 403 }
      );
    }

    const currentTier = await getWorkspaceTier(normalizedWsId, {
      useAdmin: true,
    });

    if (!isFeatureAvailable('voice_assistant', currentTier)) {
      return Response.json(
        { error: 'Voice Assistant requires PRO tier or higher' },
        { status: 403 }
      );
    }

    const resolvedModel = model ?? ASSISTANT_LIVE_MODEL;
    const chat = await ensureAssistantLiveChat({
      supabase,
      userId: user.id,
      chatId,
      model: resolvedModel,
    });
    const seedHistory = await loadAssistantLiveSeedHistory({
      supabase,
      chatId: chat.id,
      userId: user.id,
    });

    const token = await createConstrainedLiveToken({
      model: resolvedModel,
      systemInstruction: ASSISTANT_SYSTEM_INSTRUCTION,
      tools: [
        { functionDeclarations: ASSISTANT_LIVE_TOOL_DECLARATIONS },
        { googleSearch: {} },
      ],
      toolConfig: ASSISTANT_LIVE_TOOL_CONFIG,
      responseModalities: [Modality.TEXT, Modality.AUDIO],
      thinkingLevel: ThinkingLevel.MINIMAL,
    });

    return Response.json({
      token,
      chatId: chat.id,
      scopeKey: assistantChatScopeKey(chat.id),
      model: resolvedModel,
      seedHistory,
    });
  } catch (error) {
    console.error('Error generating mobile assistant live token:', error);
    return Response.json(
      { error: 'Failed to generate assistant live token' },
      { status: 500 }
    );
  }
}
