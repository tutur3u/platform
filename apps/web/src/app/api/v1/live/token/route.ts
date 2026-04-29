import { Modality, ThinkingLevel } from '@google/genai';
import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import { createClient } from '@tuturuuu/supabase/next/server';
import {
  getWorkspaceTier,
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { isFeatureAvailable } from '@/lib/feature-tiers';
import {
  ASSISTANT_LIVE_MODEL,
  ASSISTANT_LIVE_TOOL_CONFIG,
  ASSISTANT_LIVE_TOOL_DECLARATIONS,
  ASSISTANT_SYSTEM_INSTRUCTION,
} from '@/lib/live/assistant-tools';
import { WEB_ASSISTANT_LIVE_SCOPE_KEY } from '@/lib/live/session-scope';
import { createConstrainedLiveToken } from '@/lib/live/token-builder';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { wsId } = body as { wsId?: string };

    if (!wsId) {
      return Response.json(
        { error: 'Missing wsId parameter' },
        { status: 400 }
      );
    }

    const supabase = await createClient(request);
    const { user } = await resolveAuthenticatedSessionUser(supabase);

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const normalizedWsId = await normalizeWorkspaceId(wsId);
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

    const token = await createConstrainedLiveToken({
      model: ASSISTANT_LIVE_MODEL,
      systemInstruction: ASSISTANT_SYSTEM_INSTRUCTION,
      tools: [
        { functionDeclarations: ASSISTANT_LIVE_TOOL_DECLARATIONS },
        { googleSearch: {} },
      ],
      toolConfig: ASSISTANT_LIVE_TOOL_CONFIG,
      responseModalities: [Modality.AUDIO],
      thinkingLevel: ThinkingLevel.MINIMAL,
    });

    return Response.json({
      token,
      scopeKey: WEB_ASSISTANT_LIVE_SCOPE_KEY,
      model: ASSISTANT_LIVE_MODEL,
    });
  } catch (error) {
    console.error('Error generating ephemeral token:', error);
    return Response.json(
      { error: 'Failed to generate token' },
      { status: 500 }
    );
  }
}
