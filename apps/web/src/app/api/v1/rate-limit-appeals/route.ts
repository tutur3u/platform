import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import {
  isTurnstileError,
  verifyTurnstileToken,
} from '@tuturuuu/turnstile/server';
import type { Json } from '@tuturuuu/types';
import { extractIPFromHeaders } from '@tuturuuu/utils/abuse-protection';
import {
  getAppealReliefTtlSeconds,
  setCachedIpBlockAppealRelief,
} from '@tuturuuu/utils/abuse-protection/edge-trust';
import { getProxySessionSubjectKeyFromCookieHeader } from '@tuturuuu/utils/api-proxy-guard';
import { MAX_SEARCH_LENGTH } from '@tuturuuu/utils/constants';
import { getUpstashRestRedisClient } from '@tuturuuu/utils/upstash-rest';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import {
  buildRateLimitAppealRowFields,
  extractWorkspaceIdFromAppealDiagnostics,
  sanitizeRateLimitAppealDiagnostics,
} from '@/lib/rate-limit-appeals';

const APPEAL_THROTTLE_LIMIT = 3;
const APPEAL_THROTTLE_WINDOW_SECONDS = 60 * 60;

const SubmitAppealSchema = z.object({
  diagnostics: z.unknown(),
  message: z.string().trim().max(2000).optional(),
  turnstileToken: z.string().trim().max(4096).optional(),
});

function rateLimitAppealsTable(client: unknown) {
  return (client as { from: (table: string) => any }).from(
    'rate_limit_appeals'
  );
}

async function checkAppealThrottle(userId: string, clientIp: string) {
  const redis = await getUpstashRestRedisClient().catch((error) => {
    serverLogger.warn('Rate-limit appeal throttle Redis unavailable', error);
    return null;
  });

  if (!redis) {
    return { allowed: true, retryAfterSeconds: 0 };
  }

  const key = `rate-limit-appeal:submit:${userId}:${clientIp}`;

  try {
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, APPEAL_THROTTLE_WINDOW_SECONDS);
    }

    if (count <= APPEAL_THROTTLE_LIMIT) {
      return { allowed: true, retryAfterSeconds: 0 };
    }

    const ttl = await redis
      .ttl(key)
      .catch(() => APPEAL_THROTTLE_WINDOW_SECONDS);
    return {
      allowed: false,
      retryAfterSeconds:
        typeof ttl === 'number' && ttl > 0
          ? ttl
          : APPEAL_THROTTLE_WINDOW_SECONDS,
    };
  } catch (error) {
    serverLogger.warn('Rate-limit appeal throttle failed open', error);
    return { allowed: true, retryAfterSeconds: 0 };
  }
}

async function findPendingAppeal(args: {
  client: unknown;
  clientIp: string;
  userId: string;
  workspaceId: string | null;
}) {
  let query = rateLimitAppealsTable(args.client)
    .select('*')
    .eq('creator_id', args.userId)
    .eq('client_ip', args.clientIp)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1);

  query = args.workspaceId
    ? query.eq('workspace_id', args.workspaceId)
    : query.is('workspace_id', null);

  const { data, error } = await query.maybeSingle();
  if (error) {
    throw error;
  }

  return data;
}

async function upsertAppealRelief(args: {
  appealId?: string;
  client: unknown;
  clientIp: string;
  diagnostics: Json;
  message: string | null;
  reliefExpiresAt: string;
  reliefGrantedAt: string;
  rowFields: ReturnType<typeof buildRateLimitAppealRowFields>;
  turnstileVerifiedAt: string;
  userEmail: string | null;
  userId: string;
  workspaceId: string | null;
}) {
  const basePayload = {
    ...args.rowFields,
    client_ip: args.clientIp,
    diagnostics: args.diagnostics,
    message: args.message,
    temporary_relief_expires_at: args.reliefExpiresAt,
    temporary_relief_granted_at: args.reliefGrantedAt,
    turnstile_verified_at: args.turnstileVerifiedAt,
    user_email: args.userEmail,
    workspace_id: args.workspaceId,
  };

  if (args.appealId) {
    const { data, error } = await rateLimitAppealsTable(args.client)
      .update(basePayload)
      .eq('id', args.appealId)
      .select('*')
      .single();

    if (error) {
      throw error;
    }
    return data;
  }

  const { data, error } = await rateLimitAppealsTable(args.client)
    .insert({
      ...basePayload,
      creator_id: args.userId,
      status: 'pending',
    })
    .select('*')
    .single();

  if (error) {
    throw error;
  }
  return data;
}

export async function POST(request: Request) {
  let body: z.infer<typeof SubmitAppealSchema>;
  try {
    body = SubmitAppealSchema.parse(await request.json());
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { errors: error.issues, message: 'Invalid request data' },
        { status: 400 }
      );
    }

    return NextResponse.json({ message: 'Invalid JSON body' }, { status: 400 });
  }

  const supabase = await createClient(request);
  const { user } = await resolveAuthenticatedSessionUser(supabase);

  if (!user) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const clientIp = extractIPFromHeaders(request.headers);
  if (!clientIp || clientIp === 'unknown') {
    return NextResponse.json(
      { message: 'Unable to identify client IP' },
      { status: 400 }
    );
  }

  const sessionKey = await getProxySessionSubjectKeyFromCookieHeader(
    request.headers.get('cookie')
  );
  if (!sessionKey) {
    return NextResponse.json(
      { message: 'A browser session is required for temporary review access' },
      { status: 400 }
    );
  }

  try {
    await verifyTurnstileToken(request, body.turnstileToken, {
      remoteIp: clientIp,
    });
  } catch (error) {
    if (isTurnstileError(error)) {
      return NextResponse.json(
        { code: error.code, message: error.message },
        { status: 400 }
      );
    }

    serverLogger.error('Unexpected Turnstile verification error', error);
    return NextResponse.json(
      { message: 'Turnstile verification failed' },
      { status: 400 }
    );
  }

  const throttle = await checkAppealThrottle(user.id, clientIp);
  if (!throttle.allowed) {
    return NextResponse.json(
      { message: 'Too many appeal requests' },
      {
        headers: { 'Retry-After': `${throttle.retryAfterSeconds}` },
        status: 429,
      }
    );
  }

  const diagnostics = sanitizeRateLimitAppealDiagnostics(body.diagnostics);
  const workspaceId = extractWorkspaceIdFromAppealDiagnostics(diagnostics);
  const now = new Date();
  const reliefTtlSeconds = getAppealReliefTtlSeconds();
  const reliefExpiresAt = new Date(
    now.getTime() + reliefTtlSeconds * 1000
  ).toISOString();
  const ipKey = `ip:${clientIp}`;
  const sbAdmin = await createAdminClient({ noCookie: true });

  try {
    const existingAppeal = await findPendingAppeal({
      client: sbAdmin,
      clientIp,
      userId: user.id,
      workspaceId,
    });

    await setCachedIpBlockAppealRelief(sessionKey, ipKey, reliefTtlSeconds);

    const appeal = await upsertAppealRelief({
      appealId: existingAppeal?.id,
      client: sbAdmin,
      clientIp,
      diagnostics: diagnostics as Json,
      message: body.message?.slice(0, MAX_SEARCH_LENGTH) ?? null,
      reliefExpiresAt,
      reliefGrantedAt: now.toISOString(),
      rowFields: buildRateLimitAppealRowFields(diagnostics),
      turnstileVerifiedAt: now.toISOString(),
      userEmail: user.email ?? diagnostics.identity?.userEmail ?? null,
      userId: user.id,
      workspaceId,
    });

    return NextResponse.json({
      appeal,
      coalesced: Boolean(existingAppeal),
      temporaryReliefExpiresAt: reliefExpiresAt,
    });
  } catch (error) {
    serverLogger.error('Failed to submit rate-limit appeal', error);
    return NextResponse.json(
      { message: 'Failed to submit appeal' },
      { status: 500 }
    );
  }
}
