import { Modality, ThinkingLevel } from '@google/genai';
import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import {
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import {
  ASSISTANT_LIVE_MODEL,
  ASSISTANT_LIVE_TOOL_CONFIG,
  ASSISTANT_LIVE_TOOL_DECLARATIONS,
  ASSISTANT_SYSTEM_INSTRUCTION,
} from '@/lib/live/assistant-tools';
import {
  abortLiveBillingSession,
  beginLiveBillingSession,
  LiveBillingError,
} from '@/lib/live/billing';
import { WEB_ASSISTANT_LIVE_SCOPE_KEY } from '@/lib/live/session-scope';
import {
  createConstrainedLiveToken,
  LIVE_TOKEN_LIFETIME_MS,
} from '@/lib/live/token-builder';

const RequestSchema = z.object({
  creditSource: z.enum(['personal', 'workspace']),
  creditWsId: z.string().trim().min(1).max(128).optional(),
  wsId: z.string().trim().min(1).max(128),
});

async function resolveBillingWorkspace({
  accessWsId,
  creditSource,
  creditWsId,
  userId,
}: {
  accessWsId: string;
  creditSource: 'personal' | 'workspace';
  creditWsId?: string;
  userId: string;
}) {
  const sbAdmin = await createAdminClient({ noCookie: true });
  if (creditSource === 'personal') {
    const { data, error } = await sbAdmin
      .from('workspaces')
      .select('id, workspace_members!inner(user_id)')
      .eq('personal', true)
      .eq('workspace_members.user_id', userId)
      .maybeSingle();
    if (error) throw new Error('Failed to resolve personal workspace');
    if (!data?.id || (creditWsId && creditWsId !== data.id)) {
      throw new LiveBillingError(
        'Invalid personal credit source.',
        'INVALID_CREDIT_SOURCE',
        403
      );
    }
    return data.id;
  }

  if (creditWsId && creditWsId !== accessWsId) {
    throw new LiveBillingError(
      'Invalid workspace credit source.',
      'INVALID_CREDIT_SOURCE',
      403
    );
  }
  return accessWsId;
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: 'Invalid request body' }, { status: 400 });
  }

  let liveSessionId: string | null = null;
  let userId: string | null = null;
  try {
    const supabase = await createClient(request);
    const { user } = await resolveAuthenticatedSessionUser(supabase);
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    userId = user.id;

    const accessWsId = await normalizeWorkspaceId(
      parsed.data.wsId,
      supabase,
      request
    );
    const membership = await verifyWorkspaceMembershipType({
      supabase,
      userId: user.id,
      wsId: accessWsId,
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

    const normalizedCreditWsId = parsed.data.creditWsId
      ? await normalizeWorkspaceId(parsed.data.creditWsId, supabase, request)
      : undefined;
    const billingWsId = await resolveBillingWorkspace({
      accessWsId,
      creditSource: parsed.data.creditSource,
      creditWsId: normalizedCreditWsId,
      userId: user.id,
    });
    const expiresAt = new Date(
      Date.now() + LIVE_TOKEN_LIFETIME_MS
    ).toISOString();
    const billing = await beginLiveBillingSession({
      accessWsId,
      billingWsId,
      expiresAt,
      model: ASSISTANT_LIVE_MODEL,
      userId: user.id,
    });
    liveSessionId = billing.liveSessionId;

    const token = await createConstrainedLiveToken({
      model: ASSISTANT_LIVE_MODEL,
      responseModalities: [Modality.AUDIO],
      systemInstruction: ASSISTANT_SYSTEM_INSTRUCTION,
      thinkingLevel: ThinkingLevel.MINIMAL,
      toolConfig: ASSISTANT_LIVE_TOOL_CONFIG,
      tools: [
        { functionDeclarations: ASSISTANT_LIVE_TOOL_DECLARATIONS },
        { googleSearch: {} },
      ],
    });

    return Response.json({
      expiresAt,
      liveSessionId,
      model: ASSISTANT_LIVE_MODEL,
      reservedCredits: billing.reservedCredits,
      scopeKey: WEB_ASSISTANT_LIVE_SCOPE_KEY,
      token,
    });
  } catch (error) {
    if (liveSessionId && userId) {
      await abortLiveBillingSession({ liveSessionId, userId }).catch(
        (abortError) => {
          console.error(
            'Failed to release Live billing reservation',
            abortError
          );
        }
      );
    }
    if (error instanceof LiveBillingError) {
      return Response.json(
        { code: error.code, error: error.message },
        { status: error.status }
      );
    }
    console.error('Error generating ephemeral token', error);
    const notConfigured =
      error instanceof Error &&
      error.message.includes('GOOGLE_GENERATIVE_AI_API_KEY');
    return Response.json(
      {
        code: notConfigured ? 'LIVE_NOT_CONFIGURED' : 'LIVE_TOKEN_FAILED',
        error: notConfigured
          ? 'Live mode is not configured.'
          : 'Failed to generate token',
      },
      { status: 500 }
    );
  }
}
