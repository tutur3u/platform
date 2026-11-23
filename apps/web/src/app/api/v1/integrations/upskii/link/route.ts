import {
  getBearerAppCoordinationToken,
  verifyAppCoordinationToken,
} from '@tuturuuu/auth/app-coordination';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { extractIPFromRequest } from '@tuturuuu/utils/abuse-protection/edge';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { CURRENT_USER_APP_SESSION_AUTH } from '@/legacy-api-routes/v1/users/me/session-auth';
import { withSessionAuth } from '@/lib/api-auth';
import { requireLiveExternalApp } from '@/lib/app-coordination/external-app-bearer';
import {
  canUserLinkUpskii,
  jsonNoStore,
} from '@/lib/integrations/upskii/access';
import {
  UPSKII_APP_ID,
  UPSKII_LINK_WRITE_SCOPE,
  UPSKII_READ_SCOPES,
} from '@/lib/integrations/upskii/constants';
import {
  auditLinkEvent,
  linkUpskiiAccount,
  revokeUpskiiLinkForUser,
  summarizeLink,
} from '@/lib/integrations/upskii/link-service';
import { createExternalAccountLinkStore } from '@/lib/integrations/upskii/link-store';
import {
  admitAccountLinkRequest,
  limitVerifiedAccountLinkRequest,
} from '@/lib/integrations/upskii/rate-limit';

const linkSchema = z.object({
  scopes: z.array(z.enum(UPSKII_READ_SCOPES)).min(1).max(3),
  upskiiEmail: z.string().trim().toLowerCase().email().max(320).nullish(),
  upskiiUserId: z.string().trim().min(1).max(128),
});

/**
 * Upskii's server creates the link with the bearer it just exchanged for the
 * user's PKCE-bound handoff. Only that bearer can link, and only for its user.
 */
export async function POST(request: NextRequest) {
  const token = getBearerAppCoordinationToken(request);
  const admission = await admitAccountLinkRequest({
    appId: UPSKII_APP_ID,
    appSecret: token ?? undefined,
    ip: extractIPFromRequest(request.headers),
    route: 'link',
  });
  if (admission) return admission;

  const verified = token ? verifyAppCoordinationToken(token) : null;
  if (
    !verified?.ok ||
    verified.claims.target_app !== UPSKII_APP_ID ||
    !verified.claims.scopes.includes(UPSKII_LINK_WRITE_SCOPE)
  ) {
    console.warn('[upskii-link] credential refused', {
      reason: 'bearer',
      route: 'link',
    });
    return jsonNoStore({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = (await createAdminClient()) as TypedSupabaseClient;
  const live = await requireLiveExternalApp(admin, verified.claims);
  if (!live.ok) return live.response;

  const limited = await limitVerifiedAccountLinkRequest({
    appId: UPSKII_APP_ID,
    route: 'link',
    userId: verified.claims.sub,
  });
  if (limited) return limited;

  const parsed = linkSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return jsonNoStore({ error: 'Invalid link payload' }, { status: 400 });
  }

  const userId = verified.claims.sub;
  if (!(await canUserLinkUpskii(admin, userId))) {
    auditLinkEvent('link_refused', { reason: 'early_access', userId });
    return jsonNoStore(
      { code: 'EARLY_ACCESS_ONLY', error: 'Linking is in early access' },
      { status: 403 }
    );
  }

  const result = await linkUpskiiAccount(
    createExternalAccountLinkStore(admin),
    {
      bearerJti: verified.claims.jti,
      scopes: parsed.data.scopes,
      upskiiEmail: parsed.data.upskiiEmail ?? null,
      upskiiUserId: parsed.data.upskiiUserId,
      userId,
    }
  );
  if (!result.ok && result.code === 'LINK_BEARER_USED') {
    auditLinkEvent('link_refused', { reason: 'bearer_reused', userId });
    return jsonNoStore(
      { code: result.code, error: 'Unauthorized' },
      { status: 401 }
    );
  }
  if (!result.ok) {
    auditLinkEvent('link_refused', {
      reason: 'conflict',
      side: result.side,
      userId,
    });
    return jsonNoStore(
      { code: result.code, error: 'Account already linked', side: result.side },
      { status: 409 }
    );
  }

  auditLinkEvent(result.created ? 'linked' : 'relinked', {
    linkId: result.link.id,
    userId,
  });
  return jsonNoStore(
    {
      linkId: result.link.id,
      linkedAt: result.link.linked_at,
      scopes: result.link.scopes,
      tuturuuuEmail: verified.claims.email,
    },
    { status: result.created ? 201 : 200 }
  );
}

const SESSION_OPTIONS = {
  allowAppSessionAuth: CURRENT_USER_APP_SESSION_AUTH,
  rateLimit: { windowMs: 60000, maxRequests: 30 },
  skipAppSessionStepUpChallenge: true,
} as const;

/** The signed-in user's link status, for the settings Integrations tab. */
export const GET = withSessionAuth(async (_request, { user }) => {
  const admin = (await createAdminClient()) as TypedSupabaseClient;
  const store = createExternalAccountLinkStore(admin);
  const [link, canLink] = await Promise.all([
    store.findActiveByUser(user.id),
    canUserLinkUpskii(admin, user.id),
  ]);
  return jsonNoStore({
    canLink,
    link: link ? summarizeLink(link) : null,
  });
}, SESSION_OPTIONS);

/** Disconnects the signed-in user's link. Reads stop at once. */
export const DELETE = withSessionAuth(async (_request, { user }) => {
  const admin = (await createAdminClient()) as TypedSupabaseClient;
  const revoked = await revokeUpskiiLinkForUser(
    createExternalAccountLinkStore(admin),
    user.id
  );
  if (revoked) {
    auditLinkEvent('unlinked', {
      linkId: revoked.id,
      side: 'tuturuuu',
      userId: user.id,
    });
  }
  return new NextResponse(null, {
    headers: { 'Cache-Control': 'no-store' },
    status: 204,
  });
}, SESSION_OPTIONS);
