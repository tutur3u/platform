import { createAppCoordinationToken } from '@tuturuuu/auth/app-coordination';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { extractIPFromRequest } from '@tuturuuu/utils/abuse-protection/edge';
import { getAppDomainMap } from '@tuturuuu/utils/internal-domains';
import { isRequiredMfaProofAllowed } from '@tuturuuu/utils/required-mfa-app-session';
import type { MfaSessionProof } from '@tuturuuu/utils/required-mfa-policy';
import { readMfaTransfer } from '@tuturuuu/utils/required-mfa-transfer';
import type { SessionAssurance } from '@tuturuuu/utils/session-assurance';
import {
  readSessionAssuranceTransfer,
  sessionAssuranceFromAppCoordinationClaims,
} from '@tuturuuu/utils/session-assurance-transfer';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { BASE_URL } from '@/constants/common';
import {
  getAllowedAppTokenScopes,
  verifyExternalAppSecret,
} from '@/lib/app-coordination/external-apps';
import {
  INVITATION_ACTION_SCOPE,
  INVITATION_ACTION_TOKEN_TTL_SECONDS,
  invitationWorkspaceScope,
} from '@/lib/app-coordination/invitation-action-token';
import { getAppCoordinationSessionPolicy } from '@/lib/app-coordination/session-policy';
import { authorizeWorkspaceSessionAppTokenExchange } from '@/lib/app-coordination/workspace-session';
import { PKCE_CODE_VERIFIER_PATTERN } from '@/lib/auth/cross-app-pkce';
import {
  type AuthUserIdentity,
  getAuthUserIdentity,
  getExchangeUserProfile,
} from '@/lib/auth/external-app-exchange-profile';
import { createExchangeTokenResponse } from '@/lib/auth/external-app-exchange-response';
import { verifyExternalAppRefreshToken } from '@/lib/auth/external-app-refresh';
import {
  admitExternalAppExchange,
  limitVerifiedExternalAppExchange,
  paceExternalAppExchangeFailure,
} from '@/lib/external-apps/exchange-rate-limit';
import { authorizeExternalProjectAppTokenExchange } from '@/lib/external-projects/access';
import { withRequestLogDrain } from '@/lib/infrastructure/log-drain';
import type { WorkspaceInvitationRecord } from '@/lib/workspace-invitations/status';
import { acceptIeeaiFreeInvite } from '@/lib/workspace-invitations/ieeai-free-invite';

const WORKSPACE_SESSION_SCOPE = 'workspace:session';

const exchangeSchema = z.object({
  appId: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_-]{1,64}$/u)
    .optional(),
  appSecret: z.string().min(1).max(200).optional(),
  codeVerifier: z.string().regex(PKCE_CODE_VERIFIER_PATTERN).optional(),
  requestedScopes: z.array(z.string().min(1).max(80)).max(50).optional(),
  targetApp: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_-]{1,64}$/u)
    .optional(),
  refreshToken: z.string().min(1).optional(),
  token: z.string().min(1).optional(),
  workspaceId: z.string().trim().max(128).optional(),
});

type CrossAppValidationRow = {
  session_data?: {
    assuranceTransfer?: unknown;
    email?: unknown;
    mfaTransfer?: unknown;
  } | null;
  user_id?: string | null;
};

function getValidationRow(value: unknown): CrossAppValidationRow | null {
  if (Array.isArray(value)) {
    return getValidationRow(value[0]);
  }

  if (!value || typeof value !== 'object') {
    return null;
  }

  return value as CrossAppValidationRow;
}

function isConfiguredApp(targetApp: string) {
  return getAppDomainMap().some((domain) => domain.name === targetApp);
}

function requiresWorkspaceSessionAuthorization(scopes: string[]) {
  return scopes.includes(WORKSPACE_SESSION_SCOPE);
}

function shouldInferWorkspaceSessionScope({
  allowedWorkspaceIds,
  requestedScopes,
  workspaceId,
}: {
  allowedWorkspaceIds: string[];
  requestedScopes: string[];
  workspaceId?: string;
}) {
  const requestedWorkspaceSession = requestedScopes.includes(
    WORKSPACE_SESSION_SCOPE
  );

  return (
    allowedWorkspaceIds.length > 0 &&
    (requestedWorkspaceSession ||
      (requestedScopes.length === 0 && Boolean(workspaceId?.trim())))
  );
}

function getAllowedAppTokenScopesWithWorkspaceSession({
  allowedScopes,
  allowedWorkspaceIds,
  requestedScopes,
  workspaceId,
}: {
  allowedScopes: string[];
  allowedWorkspaceIds: string[];
  requestedScopes: string[];
  workspaceId?: string;
}) {
  const inferWorkspaceSession = shouldInferWorkspaceSessionScope({
    allowedWorkspaceIds,
    requestedScopes,
    workspaceId,
  });
  const requestedApiScopes = inferWorkspaceSession
    ? requestedScopes.filter((scope) => scope !== WORKSPACE_SESSION_SCOPE)
    : requestedScopes;
  const scopes = getAllowedAppTokenScopes({
    allowedScopes,
    requestedScopes: requestedApiScopes,
  });

  if (!inferWorkspaceSession) {
    return scopes;
  }

  return [...new Set([...scopes, WORKSPACE_SESSION_SCOPE])].sort();
}

async function resolveExchangeTarget({
  appId,
  appSecret,
  requestedScopes,
  targetApp,
  workspaceId,
}: {
  appId?: string;
  appSecret?: string;
  requestedScopes: string[];
  targetApp?: string;
  workspaceId?: string;
}) {
  const resolvedTargetApp = targetApp ?? appId;

  if (!resolvedTargetApp) {
    return {
      error: 'Missing app coordination target',
      status: 400,
    } as const;
  }

  if (appId) {
    if (targetApp && targetApp !== appId) {
      return {
        error: 'App credential target mismatch',
        status: 400,
      } as const;
    }

    if (!appSecret) {
      return {
        error: 'Missing app secret',
        status: 401,
      } as const;
    }

    const verification = await verifyExternalAppSecret({ appId, appSecret });

    if (!verification.ok) {
      return {
        error: verification.error,
        status: 401,
      } as const;
    }

    return {
      allowedWorkspaceIds: verification.app.allowedWorkspaceIds,
      maxBearerTtlSeconds: verification.app.maxBearerTtlSeconds,
      requirePkce: verification.app.requirePkce === true,
      scopes: getAllowedAppTokenScopesWithWorkspaceSession({
        allowedScopes: verification.app.allowedScopes,
        allowedWorkspaceIds: verification.app.allowedWorkspaceIds,
        requestedScopes,
        workspaceId,
      }),
      targetApp: verification.app.id,
    } as const;
  }

  if (!isConfiguredApp(resolvedTargetApp)) {
    return {
      error: 'Unknown app coordination target',
      status: 400,
    } as const;
  }

  return {
    error: 'Missing app credentials',
    status: 401,
  } as const;
}

function buildInvitationUrl(request: NextRequest, workspaceId: string) {
  const path = `/${encodeURIComponent(workspaceId)}`;

  for (const baseUrl of [BASE_URL, request.nextUrl.origin]) {
    try {
      return new URL(path, baseUrl).toString();
    } catch {}
  }

  return path;
}

function toSafeInvitation(
  invitation: WorkspaceInvitationRecord | undefined,
  workspaceId: string
) {
  if (!invitation) {
    return {
      createdAt: null,
      role: null,
      source: null,
      workspaceHandle: null,
      workspaceId,
      workspaceName: null,
    };
  }

  return {
    createdAt: invitation.createdAt,
    role: invitation.type,
    source: invitation.source,
    workspaceHandle: invitation.workspace.handle,
    workspaceId: invitation.workspace.id,
    workspaceName: invitation.workspace.name,
  };
}

function createInvitationActionToken({
  email,
  mfa,
  targetApp,
  userId,
  workspaceId,
}: {
  email: string | null;
  mfa: MfaSessionProof | null;
  targetApp: string;
  userId: string;
  workspaceId: string;
}) {
  return createAppCoordinationToken({
    email,
    mfa: mfa ?? undefined,
    expiresInSeconds: INVITATION_ACTION_TOKEN_TTL_SECONDS,
    originApp: 'web',
    scopes: [INVITATION_ACTION_SCOPE, invitationWorkspaceScope(workspaceId)],
    targetApp,
    userId,
  });
}

function createPendingInvitationResponse({
  authEmail,
  mfa,
  error,
  invitation,
  request,
  status,
  targetApp,
  userId,
  workspaceId,
}: {
  authEmail: string | null;
  mfa: MfaSessionProof | null;
  error: string;
  invitation?: WorkspaceInvitationRecord;
  request: NextRequest;
  status: 403 | 500;
  targetApp: string;
  userId: string;
  workspaceId: string;
}) {
  const invitationActionToken = createInvitationActionToken({
    email: authEmail,
    mfa,
    targetApp,
    userId,
    workspaceId,
  });

  return NextResponse.json(
    {
      code: 'PENDING_WORKSPACE_INVITE',
      error,
      invitation: toSafeInvitation(invitation, workspaceId),
      invitationActionToken: invitationActionToken.token,
      invitationUrl: buildInvitationUrl(request, workspaceId),
      workspaceId,
    },
    { status }
  );
}

async function exchangeAppToken(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = exchangeSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid app token exchange payload' },
      { status: 400 }
    );
  }

  const {
    appId,
    appSecret,
    codeVerifier,
    refreshToken,
    requestedScopes = [],
    targetApp,
    token,
    workspaceId: requestedWorkspaceId,
  } = parsed.data;
  let workspaceId = requestedWorkspaceId;

  if (Boolean(token) === Boolean(refreshToken)) {
    return NextResponse.json(
      { error: 'Provide exactly one token or refresh token' },
      { status: 400 }
    );
  }

  // Token and refresh exchanges are admitted before the app secret is
  // checked, and failed secret or token checks are paced per app and IP on
  // both paths; failed secrets also block the source. Refresh also keeps its
  // own per-family pre-limit.
  const exchangeAppId = appId ?? targetApp;
  const exchange = exchangeAppId
    ? { appId: exchangeAppId, ip: extractIPFromRequest(request.headers) }
    : null;
  if (exchange) {
    const refusal = await admitExternalAppExchange(exchange);
    if (refusal) return refusal;
  }
  const failed = async (error: string, credential: 'secret' | 'token') =>
    (exchange &&
      (await paceExternalAppExchangeFailure(exchange, credential))) ||
    NextResponse.json({ error }, { status: 401 });

  let resolvedTarget: Awaited<ReturnType<typeof resolveExchangeTarget>>;

  try {
    resolvedTarget = await resolveExchangeTarget({
      appId,
      appSecret,
      requestedScopes,
      targetApp,
      workspaceId,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'app_scope_not_allowed') {
      return NextResponse.json(
        { error: 'Requested scope is not allowed for this app' },
        { status: 403 }
      );
    }

    throw error;
  }

  if ('error' in resolvedTarget) {
    if (resolvedTarget.status === 401)
      return failed(resolvedTarget.error, 'secret');
    return NextResponse.json(
      { error: resolvedTarget.error },
      { status: resolvedTarget.status }
    );
  }

  if (token) {
    const refusal = await limitVerifiedExternalAppExchange(
      resolvedTarget.targetApp
    );
    if (refusal) return refusal;
  }

  const sbAdmin = (await createAdminClient()) as TypedSupabaseClient;
  const { policy } = await getAppCoordinationSessionPolicy({ db: sbAdmin });
  let authIdentity: AuthUserIdentity;
  let userId: string;
  let mfa: MfaSessionProof | null = null;
  // Only server-signed claims; never request or caller-writable session data.
  let assurance: SessionAssurance | null = null;
  let refreshFamily: string | undefined;
  let refreshWorkspaceId: string | undefined;

  if (refreshToken) {
    const refreshResult = await verifyExternalAppRefreshToken({
      failClosed: resolvedTarget.maxBearerTtlSeconds != null,
      familyTtlSeconds: policy.internalAppRefreshTtlSeconds,
      ip: extractIPFromRequest(request.headers),
      replayGraceSeconds: policy.externalAppRefreshReplayGraceSeconds,
      refreshToken,
      targetApp: resolvedTarget.targetApp,
    });

    if (refreshResult === 'limited') {
      return NextResponse.json(
        { error: 'Too many refresh attempts' },
        { status: 429, headers: { 'Retry-After': '60' } }
      );
    }
    if (refreshResult === 'unavailable') {
      return NextResponse.json(
        { error: 'Refresh temporarily unavailable' },
        { status: 503, headers: { 'Retry-After': '30' } }
      );
    }
    if (!refreshResult)
      return failed('Invalid or expired refresh token', 'token');

    const refreshClaims = refreshResult.claims;
    refreshFamily = refreshResult.family;
    refreshWorkspaceId = refreshClaims.workspace_id;
    if (
      !refreshWorkspaceId &&
      resolvedTarget.scopes.some(
        (scope) =>
          scope === 'external-projects:manage' ||
          scope === 'external-projects:*'
      )
    ) {
      return NextResponse.json(
        { error: 'Workspace-bound sign-in required' },
        { status: 401 }
      );
    }
    workspaceId ??= refreshWorkspaceId;
    userId = refreshClaims.sub;
    mfa = refreshClaims.mfa ?? null;
    assurance = sessionAssuranceFromAppCoordinationClaims(refreshClaims);
    authIdentity = await getAuthUserIdentity({
      sbAdmin,
      sessionData: null,
      userId,
    });
  } else {
    const crossAppToken = token;

    if (!crossAppToken) {
      return NextResponse.json(
        { error: 'Provide exactly one token or refresh token' },
        { status: 400 }
      );
    }

    if (resolvedTarget.requirePkce && !codeVerifier) {
      return NextResponse.json(
        { code: 'PKCE_REQUIRED', error: 'Missing code verifier' },
        { status: 400 }
      );
    }

    // A verifier redeems only through the service_role _pkce function; without
    // one, the anonymous validator refuses every challenge-bound token.
    const { data, error } = codeVerifier
      ? await sbAdmin.rpc('validate_cross_app_token_with_session_pkce', {
          p_code_verifier: codeVerifier,
          p_target_app: resolvedTarget.targetApp,
          p_token: crossAppToken,
        })
      : await ((await createClient(request)) as TypedSupabaseClient).rpc(
          'validate_cross_app_token_with_session',
          {
            p_target_app: resolvedTarget.targetApp,
            p_token: crossAppToken,
          }
        );

    if (error) {
      console.warn('Failed to validate cross-app token for app exchange', {
        error: error.message,
        targetApp: resolvedTarget.targetApp,
      });
      return failed('Invalid or expired token', 'token');
    }

    const validationRow = getValidationRow(data);
    userId = validationRow?.user_id ?? '';
    mfa = readMfaTransfer(
      validationRow?.session_data?.mfaTransfer,
      userId,
      resolvedTarget.targetApp
    );
    assurance = readSessionAssuranceTransfer(
      validationRow?.session_data?.assuranceTransfer,
      userId,
      resolvedTarget.targetApp
    );

    if (!userId) return failed('Invalid or expired token', 'token');

    authIdentity = await getAuthUserIdentity({
      sbAdmin,
      sessionData: validationRow?.session_data ?? null,
      userId,
    });
  }

  if (!(await isRequiredMfaProofAllowed(userId, mfa))) {
    return NextResponse.json(
      { code: 'MFA_REQUIRED', error: 'MFA verification required' },
      { status: 403 }
    );
  }
  let workspaceSessionAuthorization = requiresWorkspaceSessionAuthorization(
    resolvedTarget.scopes
  )
    ? await authorizeWorkspaceSessionAppTokenExchange({
        admin: sbAdmin,
        allowedWorkspaceIds: resolvedTarget.allowedWorkspaceIds,
        authEmail: authIdentity.email,
        userId,
        workspaceId,
      })
    : null;

  if (
    token &&
    workspaceSessionAuthorization &&
    !workspaceSessionAuthorization.ok &&
    workspaceSessionAuthorization.status === 403 &&
    workspaceSessionAuthorization.invitation?.type !== 'GUEST' &&
    (await acceptIeeaiFreeInvite({
      admin: sbAdmin,
      appId: resolvedTarget.targetApp,
      allowedWorkspaceIds: resolvedTarget.allowedWorkspaceIds,
      authEmail: authIdentity.email,
      userId,
      workspaceId:
        workspaceSessionAuthorization.normalizedWorkspaceId ??
        workspaceId ??
        '',
    }))
  ) {
    workspaceSessionAuthorization =
      await authorizeWorkspaceSessionAppTokenExchange({
        admin: sbAdmin,
        allowedWorkspaceIds: resolvedTarget.allowedWorkspaceIds,
        authEmail: authIdentity.email,
        userId,
        workspaceId,
      });
  }

  if (workspaceSessionAuthorization && !workspaceSessionAuthorization.ok) {
    if (workspaceSessionAuthorization.code === 'PENDING_WORKSPACE_INVITE') {
      const normalizedWorkspaceId =
        workspaceSessionAuthorization.normalizedWorkspaceId;
      return createPendingInvitationResponse({
        mfa,
        authEmail: authIdentity.email,
        error: workspaceSessionAuthorization.error,
        invitation: workspaceSessionAuthorization.invitation,
        request,
        status: workspaceSessionAuthorization.status === 403 ? 403 : 500,
        targetApp: resolvedTarget.targetApp,
        userId,
        workspaceId: normalizedWorkspaceId ?? workspaceId ?? '',
      });
    }

    return NextResponse.json(
      { error: workspaceSessionAuthorization.error },
      { status: workspaceSessionAuthorization.status }
    );
  }

  const exchangeAuthorization = await authorizeExternalProjectAppTokenExchange({
    admin: sbAdmin,
    appId: resolvedTarget.targetApp,
    authEmail: authIdentity.email,
    scopes: resolvedTarget.scopes,
    userId,
    workspaceId,
  });

  if (!exchangeAuthorization.ok) {
    if (exchangeAuthorization.code === 'PENDING_WORKSPACE_INVITE') {
      const normalizedWorkspaceId = exchangeAuthorization.normalizedWorkspaceId;
      return createPendingInvitationResponse({
        mfa,
        authEmail: authIdentity.email,
        error: exchangeAuthorization.error,
        invitation: exchangeAuthorization.invitation,
        request,
        status: exchangeAuthorization.status === 403 ? 403 : 500,
        targetApp: resolvedTarget.targetApp,
        userId,
        workspaceId: normalizedWorkspaceId ?? workspaceId ?? '',
      });
    }

    return NextResponse.json(
      { error: exchangeAuthorization.error },
      { status: exchangeAuthorization.status }
    );
  }

  const normalizedWorkspaceId =
    exchangeAuthorization.normalizedWorkspaceId ??
    workspaceSessionAuthorization?.normalizedWorkspaceId;
  if (refreshWorkspaceId && normalizedWorkspaceId !== refreshWorkspaceId) {
    return NextResponse.json(
      { error: 'Refresh workspace does not match' },
      { status: 403 }
    );
  }

  const userProfile = await getExchangeUserProfile({
    authIdentity,
    sbAdmin,
    userId,
  });

  return createExchangeTokenResponse({
    maxBearerTtlSeconds: resolvedTarget.maxBearerTtlSeconds,
    refreshFamily,
    assurance,
    mfa,
    email: authIdentity.email,
    normalizedWorkspaceId,
    policy,
    scopes: resolvedTarget.scopes,
    targetApp: resolvedTarget.targetApp,
    userProfile,
    userId,
  });
}

export async function POST(request: NextRequest) {
  return withRequestLogDrain(
    {
      request,
      route: '/api/v1/auth/app-token/exchange',
    },
    () => exchangeAppToken(request)
  );
}
