import { AiStudioError } from '@tuturuuu/ai/studio/errors';
import {
  type AppCoordinationTokenClaims,
  getBearerAppCoordinationToken,
} from '@tuturuuu/auth/app-coordination';
import { verifyAppSessionRequest } from '@tuturuuu/auth/app-session';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { verifyWorkspaceMembershipType } from '@tuturuuu/utils/workspace-helper';

const EXTERNAL_APP_SECRET_PREFIX = 'EXTERNAL_APP_REGISTRY';
const WORKSPACE_SESSION_SCOPE = 'workspace:session';
export const EXTERNAL_AI_SCOPE = 'ai:use';
export const EXTERNAL_TTS_SCOPE = 'tts:use';
export const EXTERNAL_AI_WORKSPACE_HEADER = 'x-tuturuuu-workspace-id';

export type ExternalAiCredential = {
  actorId: string;
  appId: string;
  scopes: string[];
  workspaceId: string;
};

function externalAppField(appId: string, field: string) {
  return `${EXTERNAL_APP_SECRET_PREFIX}:${appId}:${field}`;
}

function parseStringArray(value: string | null | undefined): string[] {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is string => typeof entry === 'string')
      : [];
  } catch {
    return [];
  }
}

function scopeAllowed(scopes: readonly string[], requiredScope: string) {
  return scopes.some(
    (scope) =>
      scope === '*' ||
      scope === requiredScope ||
      (scope.endsWith(':*') && requiredScope.startsWith(scope.slice(0, -1)))
  );
}

function invalidExternalCredential(message: string, status = 403) {
  return new AiStudioError(message, {
    code: 'invalid_api_key',
    status,
    type: 'authentication_error',
  });
}

export async function authenticateExternalAiRequest(
  request: Request,
  requiredScope = EXTERNAL_AI_SCOPE
): Promise<ExternalAiCredential> {
  if (!getBearerAppCoordinationToken(request)) {
    throw invalidExternalCredential(
      'A Tuturuuu external-app access token is required.',
      401
    );
  }

  const verification = verifyAppSessionRequest(request, { requiredScope });
  if (!verification.ok) {
    throw invalidExternalCredential(
      'A valid external-app access token with the required scope is required.',
      401
    );
  }

  const workspaceId = request.headers
    .get(EXTERNAL_AI_WORKSPACE_HEADER)
    ?.trim()
    .toLowerCase();
  if (!workspaceId) {
    throw new AiStudioError(
      `The ${EXTERNAL_AI_WORKSPACE_HEADER} header is required.`,
      {
        code: 'invalid_request_error',
        status: 400,
      }
    );
  }

  const claims: AppCoordinationTokenClaims = verification.claims;
  if (!claims.scopes.includes(WORKSPACE_SESSION_SCOPE)) {
    throw invalidExternalCredential(
      'The external-app token is not authorized for a workspace session.'
    );
  }

  const appId = claims.target_app;
  const names = [
    externalAppField(appId, 'allowedScopes'),
    externalAppField(appId, 'allowedWorkspaceIds'),
    externalAppField(appId, 'enabled'),
  ];
  const sbAdmin = await createAdminClient({ noCookie: true });
  const { data: registrationRows, error: registrationError } = await sbAdmin
    .from('workspace_secrets')
    .select('name, value')
    .eq('ws_id', ROOT_WORKSPACE_ID)
    .in('name', names);

  if (registrationError) {
    throw new AiStudioError(
      'The external-app registration could not be verified.',
      {
        code: 'server_error',
        status: 500,
        type: 'server_error',
      }
    );
  }

  const fields = new Map(
    (registrationRows ?? []).map((row) => [row.name, row.value])
  );
  const enabled = fields.get(externalAppField(appId, 'enabled')) === 'true';
  const allowedScopes = parseStringArray(
    fields.get(externalAppField(appId, 'allowedScopes'))
  );
  const allowedWorkspaceIds = parseStringArray(
    fields.get(externalAppField(appId, 'allowedWorkspaceIds'))
  ).map((value) => value.trim().toLowerCase());

  if (
    !enabled ||
    !scopeAllowed(allowedScopes, requiredScope) ||
    !allowedWorkspaceIds.includes(workspaceId)
  ) {
    throw invalidExternalCredential(
      'The external app is not enabled or linked for this AI request.'
    );
  }

  const membership = await verifyWorkspaceMembershipType({
    requiredType: 'MEMBER',
    supabase: sbAdmin,
    userId: claims.sub,
    wsId: workspaceId,
  });

  if (membership.error === 'membership_lookup_failed') {
    throw new AiStudioError('Workspace membership could not be verified.', {
      code: 'server_error',
      status: 500,
      type: 'server_error',
    });
  }

  if (!membership.ok) {
    throw invalidExternalCredential(
      'The external-app user no longer has access to this workspace.'
    );
  }

  return {
    actorId: claims.sub,
    appId,
    scopes: claims.scopes,
    workspaceId,
  };
}
