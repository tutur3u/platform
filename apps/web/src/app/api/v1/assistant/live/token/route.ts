import { Modality, ThinkingLevel } from '@google/genai';
import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { SupabaseUser } from '@tuturuuu/supabase/next/user';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { validateAiTempAuthRequest } from '@tuturuuu/utils/ai-temp-auth';
import {
  getWorkspaceTier,
  normalizeWorkspaceId,
  resolveWorkspaceIdForPrincipal,
  verifyWorkspaceMembershipType,
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
} from '@/lib/live/assistant-tools';
import { buildLiveMiraPrompt } from '@/lib/live/mira-prompt';
import { assistantChatScopeKey } from '@/lib/live/session-scope';
import { createConstrainedLiveToken } from '@/lib/live/token-builder';

async function loadStoredSessionHandle({
  supabase,
  normalizedWsId,
  scopeKey,
  userId,
}: {
  supabase: TypedSupabaseClient;
  normalizedWsId: string;
  scopeKey: string;
  userId: string;
}) {
  const { data, error } = await supabase
    .from('live_api_sessions' as never)
    .select('session_handle, expires_at')
    .eq('user_id', userId)
    .eq('ws_id', normalizedWsId)
    .eq('scope_key', scopeKey)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  if (error != null) {
    console.error(
      'Failed to load assistant live session handle during token mint',
      error
    );
    return null;
  }

  const session = data as { session_handle?: string } | null;
  return session?.session_handle ?? null;
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { wsId, chatId, model, forceFresh } = body as {
      wsId?: string;
      chatId?: string;
      model?: string;
      forceFresh?: boolean;
    };

    if (!wsId) {
      return Response.json(
        { error: 'Missing wsId parameter' },
        { status: 400 }
      );
    }

    let supabase = await createClient(request);
    const tempAuth = await validateAiTempAuthRequest(request);
    if (tempAuth.status === 'revoked') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let user: SupabaseUser | null = null;
    if (tempAuth.status === 'valid') {
      user = tempAuth.context.user as SupabaseUser;
      // The opaque AI token is not a Supabase JWT. All admin-backed reads below
      // are explicitly scoped to this verified actor and checked workspace.
      supabase = await createAdminClient({ noCookie: true });
    } else {
      const { user: sessionUser } =
        await resolveAuthenticatedSessionUser(supabase);
      user = sessionUser;
    }

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const normalizedWsId =
      tempAuth.status === 'valid'
        ? await resolveWorkspaceIdForPrincipal({
            authorizationClient: supabase,
            principal: { id: user.id, email: user.email ?? null },
            wsId,
          })
        : await normalizeWorkspaceId(wsId, supabase);
    if (
      tempAuth.status === 'valid' &&
      tempAuth.context.wsId &&
      tempAuth.context.wsId !== normalizedWsId
    ) {
      return Response.json(
        { error: 'Workspace access denied' },
        { status: 403 }
      );
    }
    const membership = await verifyWorkspaceMembershipType({
      wsId: normalizedWsId,
      userId: user.id,
      supabase,
    });

    if (membership.error === 'membership_lookup_failed') {
      return Response.json(
        { error: 'Failed to verify workspace access' },
        { status: 500 }
      );
    }

    if (!membership.ok) {
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
    const shouldForceFresh = forceFresh === true;

    const chat = await ensureAssistantLiveChat({
      supabase,
      userId: user.id,
      chatId,
      model: resolvedModel,
    }).catch((error) => {
      console.error('Failed to prepare assistant live chat', error);
      return null;
    });

    if (chat == null) {
      return Response.json(
        { error: 'Failed to prepare assistant live session' },
        { status: 500 }
      );
    }

    const systemInstruction = await buildLiveMiraPrompt({
      supabase,
      user,
      wsId: normalizedWsId,
      dashboard: false,
    });
    const scopeKey = assistantChatScopeKey(chat.id);
    const sessionHandle = shouldForceFresh
      ? null
      : await loadStoredSessionHandle({
          supabase,
          normalizedWsId,
          scopeKey,
          userId: user.id,
        });

    const seedHistory =
      shouldForceFresh || sessionHandle == null
        ? await loadAssistantLiveSeedHistory({
            supabase,
            chatId: chat.id,
            userId: user.id,
          }).catch((error) => {
            console.error(
              'Failed to restore assistant live seed history',
              error
            );
            return null;
          })
        : [];

    if (seedHistory == null) {
      return Response.json(
        { error: 'Failed to restore assistant live history' },
        { status: 500 }
      );
    }

    let token: string;
    try {
      token = await createConstrainedLiveToken({
        model: resolvedModel,
        systemInstruction,
        tools: [
          { functionDeclarations: ASSISTANT_LIVE_TOOL_DECLARATIONS },
          { googleSearch: {} },
        ],
        toolConfig: ASSISTANT_LIVE_TOOL_CONFIG,
        responseModalities: [Modality.AUDIO],
        thinkingLevel: ThinkingLevel.MINIMAL,
      });
    } catch (error) {
      console.error('Failed to provision assistant live token', error);
      return Response.json(
        { error: 'Failed to provision Gemini Live token' },
        { status: 502 }
      );
    }

    return Response.json({
      token,
      chatId: chat.id,
      scopeKey,
      model: resolvedModel,
      sessionHandle,
      seedHistory,
    });
  } catch (error) {
    console.error('Error generating mobile assistant live token', error);
    return Response.json(
      { error: 'Failed to generate assistant live token' },
      { status: 500 }
    );
  }
}
