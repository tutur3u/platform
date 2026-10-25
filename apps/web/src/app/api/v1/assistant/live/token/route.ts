import { Modality, ThinkingLevel, Type } from '@google/genai';
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
  type OwnedAssistantLiveChat,
} from '@/lib/live/assistant-history';
import {
  ASSISTANT_LIVE_MODEL,
  ASSISTANT_LIVE_TOOL_CONFIG,
  ASSISTANT_LIVE_TOOL_DECLARATIONS,
} from '@/lib/live/assistant-tools';
import {
  CANONICAL_LIVE_TOOL_DECLARATIONS,
  type LiveToolProtocol,
  liveToolProtocolSchema,
} from '@/lib/live/canonical-tool-bridge';
import { buildLiveMiraPrompt } from '@/lib/live/mira-prompt';
import { createServerTiming } from '@/lib/live/server-timing';
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

type PreparedLiveSession = {
  chat: OwnedAssistantLiveChat;
  scopeKey: string;
  sessionHandle: string | null;
  seedHistory: Awaited<ReturnType<typeof loadAssistantLiveSeedHistory>>;
};

/**
 * Resolves the owned chat, its resumable provider handle and, only when no
 * handle can resume the provider session, the bounded seed history.
 */
async function prepareLiveSession({
  supabase,
  userId,
  normalizedWsId,
  chatId,
  model,
  forceFresh,
  toolProtocol,
}: {
  supabase: TypedSupabaseClient;
  userId: string;
  normalizedWsId: string;
  chatId?: string;
  model: string;
  forceFresh: boolean;
  toolProtocol: LiveToolProtocol;
}): Promise<PreparedLiveSession | Response> {
  const chat = await ensureAssistantLiveChat({
    supabase,
    userId,
    chatId,
    model,
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

  const scopeKey = assistantChatScopeKey(chat.id, toolProtocol);
  const sessionHandle = forceFresh
    ? null
    : await loadStoredSessionHandle({
        supabase,
        normalizedWsId,
        scopeKey,
        userId,
      });

  const seedHistory =
    sessionHandle == null
      ? await loadAssistantLiveSeedHistory({ chat, userId }).catch((error) => {
          console.error('Failed to restore assistant live seed history', error);
          return null;
        })
      : [];

  if (seedHistory == null) {
    return Response.json(
      { error: 'Failed to restore assistant live history' },
      { status: 500 }
    );
  }

  return { chat, scopeKey, sessionHandle, seedHistory };
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const {
      wsId,
      chatId,
      model,
      forceFresh,
      toolProtocol: requestedProtocol,
    } = body as {
      wsId?: string;
      chatId?: string;
      model?: string;
      forceFresh?: boolean;
      toolProtocol?: unknown;
    };

    const protocol = liveToolProtocolSchema.safeParse(
      requestedProtocol ?? 'legacy'
    );
    if (!protocol.success) {
      return Response.json(
        { error: 'Unsupported Live tool protocol' },
        { status: 400 }
      );
    }
    const toolProtocol = protocol.data;

    if (!wsId) {
      return Response.json(
        { error: 'Missing wsId parameter' },
        { status: 400 }
      );
    }

    const timing = createServerTiming();
    let supabase = await createClient(request);
    const tempAuth = await timing.measure('auth', () =>
      validateAiTempAuthRequest(request)
    );
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
      const stopSession = timing.start('session');
      const { user: sessionUser } =
        await resolveAuthenticatedSessionUser(supabase);
      stopSession();
      user = sessionUser;
    }

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const actor = user;
    const normalizedWsId = await timing.measure('workspace', () =>
      tempAuth.status === 'valid'
        ? resolveWorkspaceIdForPrincipal({
            authorizationClient: supabase,
            principal: { id: actor.id, email: actor.email ?? null },
            wsId,
          })
        : normalizeWorkspaceId(wsId, supabase)
    );
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
    // Both are reads keyed by the verified actor and normalized workspace; the
    // tier result is only used after membership passes.
    const [membership, currentTier] = await timing.measure('access', () =>
      Promise.all([
        verifyWorkspaceMembershipType({
          wsId: normalizedWsId,
          userId: actor.id,
          supabase,
        }),
        getWorkspaceTier(normalizedWsId, { useAdmin: true }),
      ])
    );

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

    if (!isFeatureAvailable('voice_assistant', currentTier)) {
      return Response.json(
        { error: 'Voice Assistant requires PRO tier or higher' },
        { status: 403 }
      );
    }

    const resolvedModel = model ?? ASSISTANT_LIVE_MODEL;
    const shouldForceFresh = forceFresh === true;

    // Prompt personalization and chat/history preparation are independent
    // after the access gates; the token is minted only when both succeed.
    const [systemInstruction, prepared] = await Promise.all([
      timing.measure('prompt', () =>
        buildLiveMiraPrompt({
          supabase,
          user: actor,
          wsId: normalizedWsId,
          dashboard: false,
          toolProtocol,
        })
      ),
      timing.measure('history', () =>
        prepareLiveSession({
          supabase,
          userId: actor.id,
          normalizedWsId,
          chatId,
          model: resolvedModel,
          forceFresh: shouldForceFresh,
          toolProtocol,
        })
      ),
    ]);

    if (prepared instanceof Response) return prepared;
    const { chat, scopeKey, sessionHandle, seedHistory } = prepared;

    let token: string;
    try {
      token = await timing.measure('mint', () =>
        createConstrainedLiveToken({
          model: resolvedModel,
          systemInstruction,
          tools: [
            {
              functionDeclarations: [
                ...(toolProtocol === 'canonical-v1'
                  ? CANONICAL_LIVE_TOOL_DECLARATIONS
                  : ASSISTANT_LIVE_TOOL_DECLARATIONS),
                {
                  name: 'get_mobile_screen_context',
                  description:
                    'Read the current mobile app section when the user has enabled Live while browsing. Returns only route metadata, never screen text. Use the declared workspace tools to fetch record details when needed.',
                  parameters: {
                    type: Type.OBJECT,
                    properties: {},
                    required: [],
                  },
                },
              ],
            },
            { googleSearch: {} },
          ],
          toolConfig: ASSISTANT_LIVE_TOOL_CONFIG,
          responseModalities: [Modality.AUDIO],
          thinkingLevel: ThinkingLevel.MINIMAL,
        })
      );
    } catch (error) {
      console.error('Failed to provision assistant live token', error);
      return Response.json(
        { error: 'Failed to provision Gemini Live token' },
        { status: 502 }
      );
    }

    return Response.json(
      {
        token,
        toolProtocol,
        chatId: chat.id,
        scopeKey,
        model: resolvedModel,
        sessionHandle,
        seedHistory,
      },
      {
        headers: {
          'Cache-Control': 'private, no-store',
          'Server-Timing': timing.header(),
        },
      }
    );
  } catch (error) {
    console.error('Error generating mobile assistant live token', error);
    return Response.json(
      { error: 'Failed to generate assistant live token' },
      { status: 500 }
    );
  }
}
