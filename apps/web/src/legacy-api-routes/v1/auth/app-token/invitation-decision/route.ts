import {
  type AppCoordinationTokenClaims,
  createAppCoordinationToken,
  verifyAppCoordinationToken,
} from '@tuturuuu/auth/app-coordination';
import type { AppCoordinationSessionPolicy } from '@tuturuuu/auth/app-session-policy';
import { createPolarClient } from '@tuturuuu/payment/polar/server';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { getUpstashRestRedisClient } from '@tuturuuu/utils/upstash-rest';
import { verifyWorkspaceMembershipType } from '@tuturuuu/utils/workspace-helper';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  getAllowedAppTokenScopes,
  verifyExternalAppSecret,
} from '@/lib/app-coordination/external-apps';
import {
  INVITATION_ACTION_SCOPE,
  invitationWorkspaceScope,
} from '@/lib/app-coordination/invitation-action-token';
import { getAppCoordinationSessionPolicy } from '@/lib/app-coordination/session-policy';
import { withRequestLogDrain } from '@/lib/infrastructure/log-drain';
import {
  getWorkspaceInviteCandidateEmails,
  getWorkspaceInviteStatus,
  type WorkspaceInvitationRecord,
} from '@/lib/workspace-invitations/status';
import {
  assignSeatToMember,
  revokeSeatFromMember,
} from '@/utils/polar-seat-helper';
import { enforceSeatLimit } from '@/utils/seat-limits';

const APP_TOKEN_REFRESH_SCOPE = 'app-token:refresh';
const INVITATION_ACTION_REPLAY_KEY_PREFIX =
  'app-token:invitation-decision:used';
const WORKSPACE_SESSION_SCOPE = 'workspace:session';

const decisionSchema = z.object({
  action: z.enum(['accept', 'reject']),
  appId: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_-]{1,64}$/u),
  appSecret: z.string().min(1).max(200),
  invitationActionToken: z.string().min(1),
  requestedScopes: z.array(z.string().min(1).max(80)).max(50).optional(),
  workspaceId: z.string().trim().min(1).max(128),
});

type AdminDb = TypedSupabaseClient;

type AuthUserIdentity = {
  email: string | null;
  metadata: Record<string, unknown> | null;
};

type UserPrivateDetailsRow = {
  email?: string | null;
  full_name?: string | null;
};

type UserProfileRow = {
  avatar_url?: string | null;
  display_name?: string | null;
  id?: string | null;
  user_private_details?: UserPrivateDetailsRow | UserPrivateDetailsRow[] | null;
};

type ExchangeUserProfile = {
  avatarUrl: string | null;
  avatar_url: string | null;
  displayName: string | null;
  display_name: string | null;
  email: string | null;
  fullName: string | null;
  full_name: string | null;
  id: string;
  name: string | null;
};

function cleanString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function firstCleanString(...values: unknown[]) {
  for (const value of values) {
    const cleaned = cleanString(value);
    if (cleaned) return cleaned;
  }

  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getPrivateDetails(
  value: UserProfileRow['user_private_details']
): UserPrivateDetailsRow | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function getUserProfileRow(value: unknown): UserProfileRow | null {
  if (!isRecord(value)) {
    return null;
  }

  return value as UserProfileRow;
}

function getAllowedScopesForDecision({
  allowedScopes,
  allowedWorkspaceIds,
  requestedScopes,
  workspaceId,
}: {
  allowedScopes: string[];
  allowedWorkspaceIds: string[];
  requestedScopes: string[];
  workspaceId: string;
}) {
  const requestedWorkspaceSession =
    requestedScopes.includes(WORKSPACE_SESSION_SCOPE) ||
    requestedScopes.length === 0;
  const requestedApiScopes = requestedWorkspaceSession
    ? requestedScopes.filter((scope) => scope !== WORKSPACE_SESSION_SCOPE)
    : requestedScopes;
  const scopes = getAllowedAppTokenScopes({
    allowedScopes,
    requestedScopes: requestedApiScopes,
  });

  if (
    requestedWorkspaceSession &&
    allowedWorkspaceIds.includes(workspaceId.toLowerCase())
  ) {
    return [...new Set([...scopes, WORKSPACE_SESSION_SCOPE])].sort();
  }

  return scopes;
}

async function getAuthUserIdentity({
  admin,
  fallbackEmail,
  userId,
}: {
  admin: AdminDb;
  fallbackEmail: string | null;
  userId: string;
}): Promise<AuthUserIdentity> {
  const { data, error } = await admin.auth.admin.getUserById(userId);

  if (error) {
    console.warn('Failed to fetch invitation decision auth user profile', {
      error: error.message,
      userId,
    });

    return {
      email: fallbackEmail,
      metadata: null,
    };
  }

  return {
    email: fallbackEmail ?? cleanString(data.user?.email),
    metadata: isRecord(data.user?.user_metadata)
      ? data.user.user_metadata
      : null,
  };
}

async function getExchangeUserProfile({
  admin,
  authIdentity,
  userId,
}: {
  admin: AdminDb;
  authIdentity: AuthUserIdentity;
  userId: string;
}): Promise<ExchangeUserProfile> {
  const { data, error } = await admin
    .from('users')
    .select(
      'id, display_name, avatar_url, user_private_details(email, full_name)'
    )
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    console.warn('Failed to fetch invitation decision user profile', {
      error: error.message,
      userId,
    });
  }

  const userProfile = error ? null : getUserProfileRow(data);
  const privateDetails = getPrivateDetails(userProfile?.user_private_details);
  const displayName = firstCleanString(
    userProfile?.display_name,
    authIdentity.metadata?.display_name
  );
  const fullName = firstCleanString(
    privateDetails?.full_name,
    authIdentity.metadata?.full_name
  );
  const email = firstCleanString(privateDetails?.email, authIdentity.email);
  const avatarUrl = firstCleanString(
    userProfile?.avatar_url,
    authIdentity.metadata?.avatar_url
  );

  return {
    avatarUrl,
    avatar_url: avatarUrl,
    displayName,
    display_name: displayName,
    email,
    fullName,
    full_name: fullName,
    id: firstCleanString(userProfile?.id) ?? userId,
    name: firstCleanString(displayName, fullName, email),
  };
}

function createExchangeTokenBody({
  email,
  normalizedWorkspaceId,
  policy,
  scopes,
  targetApp,
  userProfile,
  userId,
}: {
  email: string | null;
  normalizedWorkspaceId: string;
  policy: AppCoordinationSessionPolicy;
  scopes: string[];
  targetApp: string;
  userProfile: ExchangeUserProfile;
  userId: string;
}) {
  const accessToken = createAppCoordinationToken({
    email,
    expiresInSeconds: policy.externalAppBearerTtlSeconds,
    originApp: 'web',
    scopes,
    targetApp,
    userId,
  });
  const refreshToken = createAppCoordinationToken({
    email,
    expiresInSeconds: policy.internalAppRefreshTtlSeconds,
    originApp: 'web',
    scopes: [APP_TOKEN_REFRESH_SCOPE],
    targetApp,
    userId,
  });

  return {
    accessToken: accessToken.token,
    app: {
      name: accessToken.claims.target_app,
    },
    expiresAt: accessToken.expiresAt,
    expiresIn: accessToken.claims.exp - accessToken.claims.iat,
    refreshEarlySeconds: policy.internalAppRefreshEarlySeconds,
    refreshExpiresAt: refreshToken.expiresAt,
    refreshExpiresIn: refreshToken.claims.exp - refreshToken.claims.iat,
    refreshToken: refreshToken.token,
    scopes,
    tokenType: 'Bearer',
    user: userProfile,
    workspaceId: normalizedWorkspaceId,
  };
}

function verifyInvitationActionToken({
  appId,
  invitationActionToken,
  workspaceId,
}: {
  appId: string;
  invitationActionToken: string;
  workspaceId: string;
}): AppCoordinationTokenClaims | null {
  const verification = verifyAppCoordinationToken(invitationActionToken);

  if (!verification.ok) {
    return null;
  }

  const { claims } = verification;
  if (claims.target_app !== appId) return null;
  if (!claims.scopes.includes(INVITATION_ACTION_SCOPE)) return null;
  if (!claims.scopes.includes(invitationWorkspaceScope(workspaceId)))
    return null;
  return claims;
}

async function consumeInvitationActionToken(
  claims: AppCoordinationTokenClaims
) {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const ttlSeconds = claims.exp - nowSeconds;

  if (ttlSeconds <= 0 || !claims.jti.trim() || !claims.sub.trim()) {
    return false;
  }

  const redis = await getUpstashRestRedisClient().catch(() => null);
  if (!redis) {
    return false;
  }

  const key = `${INVITATION_ACTION_REPLAY_KEY_PREFIX}:${claims.sub}:${claims.jti}`;

  try {
    const consumed = await redis.set(key, String(nowSeconds), {
      ex: ttlSeconds,
      nx: true,
    });

    return consumed === 'OK';
  } catch (error) {
    console.warn('Invitation action replay check failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

async function clearPendingInvites({
  admin,
  candidateEmails,
  userId,
  workspaceId,
}: {
  admin: AdminDb;
  candidateEmails: string[];
  userId: string;
  workspaceId: string;
}) {
  await admin
    .from('workspace_invites')
    .delete()
    .eq('ws_id', workspaceId)
    .eq('user_id', userId);

  if (candidateEmails.length) {
    await admin
      .from('workspace_email_invites')
      .delete()
      .eq('ws_id', workspaceId)
      .in('email', candidateEmails);
  }
}

async function acceptInvitation({
  admin,
  authEmail,
  invitation,
  userId,
  workspaceId,
}: {
  admin: AdminDb;
  authEmail: string | null;
  invitation: WorkspaceInvitationRecord;
  userId: string;
  workspaceId: string;
}) {
  const existingMember = await verifyWorkspaceMembershipType({
    requiredType: 'ANY',
    supabase: admin,
    userId,
    wsId: workspaceId,
  });

  const candidateEmails = await getWorkspaceInviteCandidateEmails(admin, {
    authEmail,
    userId,
  });

  if (existingMember.error === 'membership_lookup_failed') {
    return NextResponse.json(
      { error: 'Failed to verify workspace membership' },
      { status: 500 }
    );
  }

  if (existingMember.ok) {
    await clearPendingInvites({ admin, candidateEmails, userId, workspaceId });
    return null;
  }

  const seatCheck = await enforceSeatLimit(admin, workspaceId);
  if (!seatCheck.allowed) {
    return NextResponse.json(
      {
        error: 'SEAT_LIMIT_REACHED',
        message: seatCheck.message,
      },
      { status: 403 }
    );
  }

  const polar = createPolarClient();
  const seatAssignment = await assignSeatToMember(
    polar,
    admin,
    workspaceId,
    userId
  );
  if (seatAssignment.required && !seatAssignment.success) {
    return NextResponse.json(
      {
        error: 'POLAR_SEAT_ASSIGNMENT_FAILED',
        message: seatAssignment.error,
      },
      { status: 403 }
    );
  }

  const { error } = await admin.from('workspace_members').insert({
    type: invitation.type,
    user_id: userId,
    ws_id: workspaceId,
  });

  if (error) {
    if (error.code === '23505') {
      await clearPendingInvites({
        admin,
        candidateEmails,
        userId,
        workspaceId,
      });
      return null;
    }

    if (seatAssignment.required && seatAssignment.success) {
      await revokeSeatFromMember(polar, admin, workspaceId, userId);
    }

    console.error('Error accepting external app invite:', {
      code: error.code,
      userId,
      workspaceId,
    });
    return NextResponse.json(
      {
        error: 'Failed to accept invite',
        errorCode: 'ACCEPT_INVITE_FAILED',
      },
      { status: 500 }
    );
  }

  await clearPendingInvites({ admin, candidateEmails, userId, workspaceId });
  return null;
}

async function rejectInvitation({
  admin,
  authEmail,
  userId,
  workspaceId,
}: {
  admin: AdminDb;
  authEmail: string | null;
  userId: string;
  workspaceId: string;
}) {
  const candidateEmails = await getWorkspaceInviteCandidateEmails(admin, {
    authEmail,
    userId,
  });

  await clearPendingInvites({ admin, candidateEmails, userId, workspaceId });
}

async function invitationDecision(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = decisionSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid invitation decision payload' },
      { status: 400 }
    );
  }

  const {
    action,
    appId,
    appSecret,
    invitationActionToken,
    requestedScopes = [],
    workspaceId,
  } = parsed.data;

  const appVerification = await verifyExternalAppSecret({ appId, appSecret });
  if (!appVerification.ok) {
    return NextResponse.json({ error: appVerification.error }, { status: 401 });
  }

  if (
    !appVerification.app.allowedWorkspaceIds.includes(workspaceId.toLowerCase())
  ) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let claims: AppCoordinationTokenClaims | null = null;
  try {
    claims = verifyInvitationActionToken({
      appId: appVerification.app.id,
      invitationActionToken,
      workspaceId,
    });
  } catch {
    claims = null;
  }

  if (!claims) {
    return NextResponse.json(
      { error: 'Invalid or expired invitation action token' },
      { status: 401 }
    );
  }

  const consumed = await consumeInvitationActionToken(claims);
  if (!consumed) {
    return NextResponse.json(
      { error: 'Invitation action token is expired or already used' },
      { status: 409 }
    );
  }

  const admin = (await createAdminClient()) as AdminDb;
  const inviteStatus = await getWorkspaceInviteStatus(admin, {
    authEmail: claims.email,
    userId: claims.sub,
    workspaceId,
  });

  if (inviteStatus.status !== 'pending_invite') {
    return NextResponse.json(
      { error: 'Pending invitation not found' },
      { status: 404 }
    );
  }

  if (action === 'reject') {
    await rejectInvitation({
      admin,
      authEmail: claims.email,
      userId: claims.sub,
      workspaceId,
    });

    return NextResponse.json({ status: 'rejected' });
  }

  const acceptError = await acceptInvitation({
    admin,
    authEmail: claims.email,
    invitation: inviteStatus.invitation,
    userId: claims.sub,
    workspaceId,
  });
  if (acceptError) return acceptError;

  let scopes: string[];
  try {
    scopes = getAllowedScopesForDecision({
      allowedScopes: appVerification.app.allowedScopes,
      allowedWorkspaceIds: appVerification.app.allowedWorkspaceIds,
      requestedScopes,
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

  const { policy } = await getAppCoordinationSessionPolicy({ db: admin });
  const authIdentity = await getAuthUserIdentity({
    admin,
    fallbackEmail: claims.email,
    userId: claims.sub,
  });
  const userProfile = await getExchangeUserProfile({
    admin,
    authIdentity,
    userId: claims.sub,
  });

  return NextResponse.json(
    createExchangeTokenBody({
      email: userProfile.email ?? authIdentity.email,
      normalizedWorkspaceId: workspaceId,
      policy,
      scopes,
      targetApp: appVerification.app.id,
      userProfile,
      userId: claims.sub,
    })
  );
}

export async function POST(request: NextRequest) {
  return withRequestLogDrain(
    {
      request,
      route: '/api/v1/auth/app-token/invitation-decision',
    },
    () => invitationDecision(request)
  );
}
