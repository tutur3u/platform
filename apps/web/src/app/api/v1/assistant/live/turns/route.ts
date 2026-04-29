import { resolveGatewayModelId } from '@tuturuuu/ai/credits/model-mapping';
import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import { createClient } from '@tuturuuu/supabase/next/server';
import type { SupabaseUser } from '@tuturuuu/supabase/next/user';
import type { Database } from '@tuturuuu/types/db';
import { validateAiTempAuthRequest } from '@tuturuuu/utils/ai-temp-auth';
import {
  getWorkspaceTier,
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { z } from 'zod';
import { isFeatureAvailable } from '@/lib/feature-tiers';

const liveMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().default(''),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const persistLiveTurnSchema = z.object({
  wsId: z.string().min(1),
  chatId: z.string().uuid(),
  turnId: z.string().min(1),
  model: z.string().min(1),
  messages: z.array(liveMessageSchema).min(1),
});

type ChatRole = Database['public']['Enums']['chat_role'];

export async function POST(request: Request) {
  try {
    const parsed = persistLiveTurnSchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json(
        { error: 'Invalid request body', issues: parsed.error.issues },
        { status: 400 }
      );
    }

    const { wsId, chatId, turnId, model, messages } = parsed.data;
    const supabase = await createClient(request);
    const tempAuth = await validateAiTempAuthRequest(request);
    if (tempAuth.status === 'revoked') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let user: SupabaseUser | null = null;
    if (tempAuth.status === 'valid') {
      user = tempAuth.context.user as SupabaseUser;
    } else {
      const { user: sessionUser } =
        await resolveAuthenticatedSessionUser(supabase);
      user = sessionUser;
    }

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

    const { data: chat, error: chatError } = await supabase
      .from('ai_chats')
      .select('id')
      .eq('id', chatId)
      .eq('creator_id', user.id)
      .maybeSingle();

    if (chatError != null) {
      return Response.json({ error: chatError.message }, { status: 500 });
    }

    if (chat == null) {
      return Response.json({ error: 'Chat not found' }, { status: 404 });
    }

    const { data: existingRows, error: existingError } = await supabase
      .from('ai_chat_messages')
      .select('id')
      .eq('chat_id', chatId)
      .contains('metadata', { liveTurnId: turnId });

    if (existingError != null) {
      return Response.json({ error: existingError.message }, { status: 500 });
    }

    if ((existingRows ?? []).length > 0) {
      return Response.json({ success: true, inserted: 0, deduped: true });
    }

    const gatewayModel = resolveGatewayModelId(model).toLowerCase();
    const payload = messages.map((message) => ({
      chat_id: chatId,
      creator_id: user.id,
      role: message.role.toUpperCase() as ChatRole,
      content: message.content,
      model: message.role === 'assistant' ? gatewayModel : null,
      metadata: {
        liveTurnId: turnId,
        source: 'Mira',
        ...(message.metadata ?? {}),
      },
    }));

    const { error: insertError } = await supabase
      .from('ai_chat_messages')
      .insert(payload);

    if (insertError != null) {
      return Response.json({ error: insertError.message }, { status: 500 });
    }

    return Response.json({ success: true, inserted: payload.length });
  } catch (error) {
    console.error('Unexpected assistant live turn persistence error:', error);
    return Response.json(
      { error: 'Failed to persist assistant live turn' },
      { status: 500 }
    );
  }
}
