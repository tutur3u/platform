import { Behavior, Modality } from '@google/genai';
import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import {
  normalizeWorkspaceId,
  getWorkspaceTier,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import {
  ASSISTANT_LIVE_TOOL_CONFIG,
  DASHBOARD_LIVE_TOOL_DECLARATIONS,
} from '@/lib/live/assistant-tools';
import {
  abortLiveBillingSession,
  beginLiveBillingSession,
  LiveBillingError,
} from '@/lib/live/billing';
import { buildLiveMiraPrompt } from '@/lib/live/mira-prompt';
import { getLiveModeScope, LIVE_MODELS } from '@/lib/live/models';
import {
  LiveMintCapError,
  readLiveMintConfig,
  reserveLiveMint,
} from '@/lib/live/mint-cap';
import { createConstrainedLiveToken } from '@/lib/live/token-builder';

const RequestSchema = z.object({
  timezone: z.string().trim().min(1).max(100).optional(),
  mode: z.enum(['flash', 'pro']).default('flash'),
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
      .eq('creator_id', userId)
      .eq('personal', true)
      .eq('workspace_members.user_id', userId)
      .eq('workspace_members.type', 'MEMBER')
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
    const billingTier = await getWorkspaceTier(billingWsId, { useAdmin: true });
    const isFree = !['PLUS', 'PRO', 'ENTERPRISE'].includes(billingTier ?? '');
    const model = LIVE_MODELS[parsed.data.mode];
    if (isFree && model !== LIVE_MODELS.flash) {
      return Response.json(
        {
          code: 'LIVE_MODEL_NOT_ALLOWED',
          error: 'Live model is unavailable for this plan.',
        },
        { status: 403 }
      );
    }
    const config = readLiveMintConfig();
    const mint = await reserveLiveMint({ actorId: user.id, isFree, config });
    const systemInstruction = await buildLiveMiraPrompt({
      supabase,
      user,
      wsId: accessWsId,
      timezone: parsed.data.timezone,
    });
    const expiresAt = mint.expiresAt;
    const billing = await beginLiveBillingSession({
      accessWsId,
      billingWsId,
      expiresAt,
      model,
      userId: user.id,
    });
    liveSessionId = billing.liveSessionId;

    const token = await createConstrainedLiveToken({
      model,
      expiresAt,
      allowResumption: !isFree,
      responseModalities: [Modality.AUDIO],
      systemInstruction,
      toolConfig: ASSISTANT_LIVE_TOOL_CONFIG,
      tools: [
        {
          functionDeclarations: DASHBOARD_LIVE_TOOL_DECLARATIONS.map(
            (tool) => ({ ...tool, behavior: Behavior.NON_BLOCKING })
          ),
        },
        { googleSearch: {} },
      ],
    });

    return Response.json(
      {
        expiresAt,
        liveSessionId,
        model,
        reservedCredits: billing.reservedCredits,
        scopeKey: getLiveModeScope(parsed.data.mode),
        token,
      },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
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
    if (error instanceof LiveMintCapError) {
      return Response.json(
        {
          code: error.code,
          error:
            error.code === 'FREE_LIVE_DAILY_BUDGET_EXHAUSTED'
              ? 'Free Live voice has reached its daily budget. Please try again after the daily reset.'
              : 'Live token admission is unavailable.',
        },
        {
          status: error.status,
          headers: { 'Retry-After': String(error.retryAfter) },
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
