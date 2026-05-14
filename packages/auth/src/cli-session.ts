import {
  type AppCoordinationTokenClaims,
  createAppCoordinationToken,
  verifyAppCoordinationToken,
} from './app-coordination';
import {
  APP_SESSION_SCOPE,
  createAppSessionToken,
  verifyAppSessionToken,
} from './app-session';

export const CLI_APP_TARGET_APP = 'platform';
export const CLI_APP_ACCESS_SCOPE = 'cli:access';
export const CLI_APP_REFRESH_SCOPE = 'cli:refresh';
export const CLI_APP_ACCESS_TTL_SECONDS = 8 * 60 * 60;
export const CLI_APP_REFRESH_TTL_SECONDS = 90 * 24 * 60 * 60;

export type CliAppSessionPayload = {
  accessExpiresInSeconds?: number;
  email?: string | null;
  refreshExpiresInSeconds?: number;
  userId: string;
};

export type CliAppSession = {
  access: {
    claims: AppCoordinationTokenClaims;
    token: string;
  };
  refresh: {
    claims: AppCoordinationTokenClaims;
    token: string;
  };
};

export type CliAppSessionVerification =
  | {
      claims: AppCoordinationTokenClaims;
      ok: true;
    }
  | {
      error: string;
      ok: false;
    };

export function createCliAppSession(
  payload: CliAppSessionPayload,
  options: {
    now?: Date;
    secret?: string;
  } = {}
): CliAppSession {
  const access = createAppSessionToken(
    {
      email: payload.email ?? null,
      expiresInSeconds:
        payload.accessExpiresInSeconds ?? CLI_APP_ACCESS_TTL_SECONDS,
      originApp: 'cli',
      scopes: [CLI_APP_ACCESS_SCOPE],
      targetApp: CLI_APP_TARGET_APP,
      userId: payload.userId,
    },
    options
  );
  const refresh = createAppCoordinationToken(
    {
      email: payload.email ?? null,
      expiresInSeconds:
        payload.refreshExpiresInSeconds ?? CLI_APP_REFRESH_TTL_SECONDS,
      originApp: 'cli',
      scopes: [CLI_APP_REFRESH_SCOPE],
      targetApp: CLI_APP_TARGET_APP,
      userId: payload.userId,
    },
    options
  );

  return {
    access: {
      claims: access.claims,
      token: access.token,
    },
    refresh: {
      claims: refresh.claims,
      token: refresh.token,
    },
  };
}

export function verifyCliAccessToken(
  token: string,
  options: {
    now?: Date;
    secret?: string;
  } = {}
): CliAppSessionVerification {
  const verification = verifyAppSessionToken(token, {
    ...options,
    requiredScope: CLI_APP_ACCESS_SCOPE,
    targetApp: CLI_APP_TARGET_APP,
  });

  if (!verification.ok) {
    return verification;
  }

  if (!verification.claims.scopes.includes(APP_SESSION_SCOPE)) {
    return {
      error: 'CLI access token missing app-session scope',
      ok: false,
    };
  }

  return verification;
}

export function verifyCliRefreshToken(
  token: string,
  options: {
    now?: Date;
    secret?: string;
  } = {}
): CliAppSessionVerification {
  const verification = verifyAppCoordinationToken(token, options);

  if (!verification.ok) {
    return verification;
  }

  if (verification.claims.target_app !== CLI_APP_TARGET_APP) {
    return {
      error: 'CLI refresh token target mismatch',
      ok: false,
    };
  }

  if (!verification.claims.scopes.includes(CLI_APP_REFRESH_SCOPE)) {
    return {
      error: 'CLI refresh token missing required scope',
      ok: false,
    };
  }

  if (verification.claims.scopes.includes(APP_SESSION_SCOPE)) {
    return {
      error: 'CLI refresh token must not be an app-session token',
      ok: false,
    };
  }

  return verification;
}

export function createCliSessionResponseBody(session: CliAppSession) {
  return {
    session: {
      access_token: session.access.token,
      expires_at: session.access.claims.exp,
      expires_in: session.access.claims.exp - session.access.claims.iat,
      refresh_expires_at: session.refresh.claims.exp,
      refresh_expires_in:
        session.refresh.claims.exp - session.refresh.claims.iat,
      refresh_token: session.refresh.token,
      token_type: 'bearer',
    },
    sessionCreated: true,
    valid: true,
  };
}
