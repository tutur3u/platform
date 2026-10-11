import type { AppName } from '@tuturuuu/utils/internal-domains';
import {
  type AppCoordinationTokenClaims,
  createAppCoordinationToken,
  getBearerAppCoordinationToken,
  isAppCoordinationToken,
  verifyAppCoordinationToken,
} from './app-coordination';
import {
  DEFAULT_APP_COORDINATION_SESSION_POLICY,
  type ResolvedInternalAppSessionPolicy,
} from './app-session-policy';

import type { MfaSessionProof } from './required-mfa-policy';

export const APP_SESSION_COOKIE_NAME = 'tuturuuu_app_session';
export const WEB_APP_SESSION_COOKIE_NAME = 'tuturuuu_web_app_session';
export const APP_SESSION_REFRESH_COOKIE_NAME = 'tuturuuu_app_session_refresh';
export const WEB_APP_SESSION_REFRESH_COOKIE_NAME =
  'tuturuuu_web_app_session_refresh';
export const APP_SESSION_SCOPE = 'internal-app:session';
export const APP_SESSION_REFRESH_SCOPE = 'internal-app:refresh';
export const APP_SESSION_REFRESH_EARLY_SCOPE_PREFIX =
  'internal-app:refresh-early:';
export const SUPABASE_AUTH_COOKIE_PATTERN =
  /^sb-[A-Za-z0-9-]+-auth-token(?:\.\d+)?$/u;

export type AppSessionTargetApp = AppName | string;

export type AppSessionTokenPayload = {
  email?: string | null;
  expiresInSeconds?: number;
  mfa?: MfaSessionProof;
  originApp?: AppSessionTargetApp;
  scopes?: string[];
  targetApp: AppSessionTargetApp;
  userId: string;
};

export type AppSessionVerification =
  | {
      claims: AppCoordinationTokenClaims;
      ok: true;
    }
  | {
      error: string;
      ok: false;
    };

export type AppSessionTokenPair = {
  access: {
    claims: AppCoordinationTokenClaims;
    expiresAt: string;
    token: string;
  };
  refresh: {
    claims: AppCoordinationTokenClaims;
    expiresAt: string;
    token: string;
  };
  refreshEarlySeconds: number;
};

type AppSessionOptions = {
  now?: Date;
  requiredScope?: string | false;
  secret?: string;
  targetApp?: AppSessionTargetApp | readonly AppSessionTargetApp[];
};

export type AppSessionRequest = Pick<Request, 'headers'> & {
  cookies?: {
    getAll?: () => Array<{ name: string }>;
    get?: (name: string) => { value?: string } | string | undefined;
  };
  url?: string;
};

export function createAppSessionToken(
  payload: AppSessionTokenPayload,
  options: {
    now?: Date;
    secret?: string;
  } = {}
) {
  return createAppCoordinationToken(
    {
      email: payload.email ?? null,
      expiresInSeconds: payload.expiresInSeconds,
      mfa: payload.mfa,
      originApp: payload.originApp ?? 'web',
      scopes: normalizeAppSessionScopes(payload.scopes),
      targetApp: payload.targetApp,
      userId: payload.userId,
    },
    options
  );
}

export function createAppSessionRefreshToken(
  payload: AppSessionTokenPayload,
  options: {
    now?: Date;
    secret?: string;
  } = {}
) {
  return createAppCoordinationToken(
    {
      email: payload.email ?? null,
      expiresInSeconds: payload.expiresInSeconds,
      mfa: payload.mfa,
      originApp: payload.originApp ?? 'web',
      scopes: normalizeAppSessionRefreshScopes(payload.scopes),
      targetApp: payload.targetApp,
      userId: payload.userId,
    },
    options
  );
}

export function createAppSessionTokenPair(
  payload: Omit<AppSessionTokenPayload, 'expiresInSeconds'>,
  options: {
    now?: Date;
    policy?: Partial<ResolvedInternalAppSessionPolicy>;
    secret?: string;
  } = {}
): AppSessionTokenPair {
  const policy = {
    internalAppAccessTtlSeconds:
      options.policy?.internalAppAccessTtlSeconds ??
      DEFAULT_APP_COORDINATION_SESSION_POLICY.internalAppAccessTtlSeconds,
    internalAppRefreshEarlySeconds:
      options.policy?.internalAppRefreshEarlySeconds ??
      DEFAULT_APP_COORDINATION_SESSION_POLICY.internalAppRefreshEarlySeconds,
    internalAppRefreshTtlSeconds:
      options.policy?.internalAppRefreshTtlSeconds ??
      DEFAULT_APP_COORDINATION_SESSION_POLICY.internalAppRefreshTtlSeconds,
  };
  const access = createAppSessionToken(
    {
      ...payload,
      expiresInSeconds: policy.internalAppAccessTtlSeconds,
      scopes: [
        ...(payload.scopes ?? []),
        `${APP_SESSION_REFRESH_EARLY_SCOPE_PREFIX}${policy.internalAppRefreshEarlySeconds}`,
      ],
    },
    options
  );
  const refresh = createAppSessionRefreshToken(
    {
      ...payload,
      expiresInSeconds: policy.internalAppRefreshTtlSeconds,
      scopes: undefined,
    },
    options
  );

  return {
    access,
    refresh,
    refreshEarlySeconds: policy.internalAppRefreshEarlySeconds,
  };
}

export function verifyAppSessionToken(
  token: string,
  options: AppSessionOptions = {}
): AppSessionVerification {
  const verification = verifyAppCoordinationToken(token, options);

  if (!verification.ok) {
    return verification;
  }

  if (
    !matchesAppSessionTarget(verification.claims.target_app, options.targetApp)
  ) {
    return {
      error: 'App session target mismatch',
      ok: false,
    };
  }

  const requiredScope = options.requiredScope ?? APP_SESSION_SCOPE;

  if (requiredScope && !verification.claims.scopes.includes(requiredScope)) {
    return {
      error: 'App session missing required scope',
      ok: false,
    };
  }

  return verification;
}

export function verifyAppSessionRefreshToken(
  token: string,
  options: AppSessionOptions = {}
): AppSessionVerification {
  const verification = verifyAppCoordinationToken(token, options);

  if (!verification.ok) {
    return verification;
  }

  if (
    !matchesAppSessionTarget(verification.claims.target_app, options.targetApp)
  ) {
    return {
      error: 'App session target mismatch',
      ok: false,
    };
  }

  if (!verification.claims.scopes.includes(APP_SESSION_REFRESH_SCOPE)) {
    return {
      error: 'App session refresh token missing required scope',
      ok: false,
    };
  }

  if (verification.claims.scopes.includes(APP_SESSION_SCOPE)) {
    return {
      error: 'App session refresh token must not be an access token',
      ok: false,
    };
  }

  return verification;
}

export function getAppSessionRefreshEarlySeconds(
  claims: AppCoordinationTokenClaims,
  fallbackSeconds = DEFAULT_APP_COORDINATION_SESSION_POLICY.internalAppRefreshEarlySeconds
) {
  const scope = claims.scopes.find((entry) =>
    entry.startsWith(APP_SESSION_REFRESH_EARLY_SCOPE_PREFIX)
  );
  const parsed = Number.parseInt(
    scope?.slice(APP_SESSION_REFRESH_EARLY_SCOPE_PREFIX.length) ?? '',
    10
  );

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallbackSeconds;
}

function matchesAppSessionTarget(
  actualTargetApp: string,
  expectedTargetApp?: AppSessionTargetApp | readonly AppSessionTargetApp[]
) {
  if (!expectedTargetApp) return true;

  const expectedTargetApps = Array.isArray(expectedTargetApp)
    ? expectedTargetApp
    : [expectedTargetApp];

  return expectedTargetApps.includes(actualTargetApp);
}

function normalizeAppSessionScopes(scopes: string[] = []) {
  return [
    APP_SESSION_SCOPE,
    ...scopes.filter((scope) => scope !== APP_SESSION_SCOPE),
  ];
}

function normalizeAppSessionRefreshScopes(scopes: string[] = []) {
  return [
    APP_SESSION_REFRESH_SCOPE,
    ...scopes.filter(
      (scope) =>
        scope !== APP_SESSION_REFRESH_SCOPE && scope !== APP_SESSION_SCOPE
    ),
  ];
}

function getCookieValue(request: AppSessionRequest, name: string) {
  const cookieValue = request.cookies?.get?.(name);

  if (typeof cookieValue === 'string') {
    return cookieValue;
  }

  if (cookieValue?.value) {
    return cookieValue.value;
  }

  const cookieHeader = request.headers.get('cookie');

  if (!cookieHeader) {
    return null;
  }

  for (const part of cookieHeader.split(';')) {
    const [rawName, ...rawValueParts] = part.trim().split('=');

    if (rawName === name) {
      return decodeURIComponent(rawValueParts.join('='));
    }
  }

  return null;
}

export function getAppSessionTokenFromRequest(request: AppSessionRequest) {
  return getAppSessionTokenCandidatesFromRequest(request)[0] ?? null;
}

export function getWebAppSessionTokenFromRequest(request: AppSessionRequest) {
  const webCookieToken = getCookieValue(request, WEB_APP_SESSION_COOKIE_NAME);

  return webCookieToken && isAppCoordinationToken(webCookieToken)
    ? webCookieToken
    : null;
}

export function getAppSessionRefreshTokenFromRequest(
  request: AppSessionRequest
) {
  const refreshToken = getCookieValue(request, APP_SESSION_REFRESH_COOKIE_NAME);

  return refreshToken && isAppCoordinationToken(refreshToken)
    ? refreshToken
    : null;
}

export function getWebAppSessionRefreshTokenFromRequest(
  request: AppSessionRequest
) {
  const refreshToken = getCookieValue(
    request,
    WEB_APP_SESSION_REFRESH_COOKIE_NAME
  );

  return refreshToken && isAppCoordinationToken(refreshToken)
    ? refreshToken
    : null;
}

export function hasWebAppSessionTokenFromRequest(request: AppSessionRequest) {
  return Boolean(getWebAppSessionTokenFromRequest(request));
}

function getAppSessionTokenCandidatesFromRequest(request: AppSessionRequest) {
  const tokens = new Set<string>();
  const bearerToken = getBearerAppCoordinationToken(request);

  if (bearerToken) {
    tokens.add(bearerToken);
  }

  const cookieToken = getCookieValue(request, APP_SESSION_COOKIE_NAME);
  const webCookieToken = getCookieValue(request, WEB_APP_SESSION_COOKIE_NAME);

  if (webCookieToken && isAppCoordinationToken(webCookieToken)) {
    tokens.add(webCookieToken);
  }

  if (cookieToken && isAppCoordinationToken(cookieToken)) {
    tokens.add(cookieToken);
  }

  return [...tokens];
}

export function verifyAppSessionRequest(
  request: AppSessionRequest,
  options: AppSessionOptions = {}
): AppSessionVerification {
  const tokens = getAppSessionTokenCandidatesFromRequest(request);

  if (tokens.length === 0) {
    return {
      error: 'Missing app session',
      ok: false,
    };
  }

  let lastVerification: AppSessionVerification | null = null;

  for (const token of tokens) {
    const verification = verifyAppSessionToken(token, options);

    if (verification.ok) {
      return verification;
    }

    lastVerification = verification;
  }

  return (
    lastVerification ?? {
      error: 'Missing app session',
      ok: false,
    }
  );
}

export function getAppSessionClaimsFromRequest(
  request: AppSessionRequest,
  options: AppSessionOptions = {}
) {
  const verification = verifyAppSessionRequest(request, options);

  return verification.ok ? verification.claims : null;
}
