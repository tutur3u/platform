import { authenticateAiStudioRequest } from '@tuturuuu/ai/studio/auth';
import { AiStudioError } from '@tuturuuu/ai/studio/errors';
import {
  type AppCoordinationTokenClaims,
  getBearerAppCoordinationToken,
} from '@tuturuuu/auth/app-coordination';
import { verifyAppSessionRequest } from '@tuturuuu/auth/app-session';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { verifyWorkspaceMembershipType } from '@tuturuuu/utils/workspace-helper';

const EXTERNAL_APP_SECRET_PREFIX = 'EXTERNAL_APP_REGISTRY';
const WORKSPACE_SESSION_SCOPE = 'workspace:session';
export const EXTERNAL_AI_SCOPE = 'ai:use';
export const EXTERNAL_TTS_SCOPE = 'tts:use';
export const AI_STUDIO_WORKSPACE_HEADER = 'x-tuturuuu-workspace-id';

export type ExternalAppAiCredential = {
  actorId: string;
  appId: string;
  kind: 'external-app';
  scopes: string[];
  workspaceId: string;
};

export type PublicAiCredential =
  | (Awaited<ReturnType<typeof authenticateAiStudioRequest>> & {
      kind: 'api-key';
    })
  | ExternalAppAiCredential;

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

export type ExternalAppRegistration = {
  allowedScopes: string[];
  allowedWorkspaceIds: string[];
  enabled: boolean;
};

/**
 * Reads an external app's registration from the root workspace's secrets.
 *
 * Both credential kinds that can belong to an app — a user's session token and a
 * bound API key — must be checked against the same record, otherwise disabling an
 * app or unlinking a workspace would only stop the interactive half of its
 * traffic.
 */
export async function loadExternalAppRegistration(
  sbAdmin: TypedSupabaseClient,
  appId: string
): Promise<ExternalAppRegistration> {
  const { data, error } = await sbAdmin
    .from('workspace_secrets')
    .select('name, value')
    .eq('ws_id', ROOT_WORKSPACE_ID)
    .in('name', [
      externalAppField(appId, 'allowedScopes'),
      externalAppField(appId, 'allowedWorkspaceIds'),
      externalAppField(appId, 'enabled'),
    ]);

  if (error) {
    throw new AiStudioError(
      'The external-app registration could not be verified.',
      {
        code: 'server_error',
        status: 500,
        type: 'server_error',
      }
    );
  }

  const fields = new Map((data ?? []).map((row) => [row.name, row.value]));
  return {
    allowedScopes: parseStringArray(
      fields.get(externalAppField(appId, 'allowedScopes'))
    ),
    allowedWorkspaceIds: parseStringArray(
      fields.get(externalAppField(appId, 'allowedWorkspaceIds'))
    ).map((value) => value.trim().toLowerCase()),
    enabled: fields.get(externalAppField(appId, 'enabled')) === 'true',
  };
}

/**
 * Whether the app is live for this workspace at all. This is what issuing a bound
 * key requires: which operations that key may then perform is decided per request
 * by `externalAppRegistrationAllows`, so an app registered for speech only does
 * not need `ai:use` just to hold a key.
 */
export function externalAppRegistrationLinks(
  registration: ExternalAppRegistration,
  workspaceId: string
) {
  return (
    registration.enabled &&
    registration.allowedWorkspaceIds.includes(workspaceId.toLowerCase())
  );
}

export function externalAppRegistrationAllows(
  registration: ExternalAppRegistration,
  workspaceId: string,
  requiredScope: string
) {
  return (
    externalAppRegistrationLinks(registration, workspaceId) &&
    scopeAllowed(registration.allowedScopes, requiredScope)
  );
}

async function authenticateExternalAppRequest(
  request: Request,
  requiredScope: string
): Promise<ExternalAppAiCredential> {
  const verification = verifyAppSessionRequest(request, {
    requiredScope,
  });

  if (!verification.ok) {
    throw invalidExternalCredential(
      'A valid external-app access token with the required scope is required.',
      401
    );
  }

  const workspaceId = request.headers
    .get(AI_STUDIO_WORKSPACE_HEADER)
    ?.trim()
    .toLowerCase();
  if (!workspaceId) {
    throw new AiStudioError(
      `The ${AI_STUDIO_WORKSPACE_HEADER} header is required.`,
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
  const sbAdmin = await createAdminClient({ noCookie: true });
  const registration = await loadExternalAppRegistration(sbAdmin, appId);

  if (
    !externalAppRegistrationAllows(registration, workspaceId, requiredScope)
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
    kind: 'external-app',
    scopes: claims.scopes,
    workspaceId,
  };
}

export async function authenticatePublicAiRequest(
  request: Request,
  requiredScope = EXTERNAL_AI_SCOPE
): Promise<PublicAiCredential> {
  if (getBearerAppCoordinationToken(request)) {
    return authenticateExternalAppRequest(request, requiredScope);
  }

  const credential = {
    ...(await authenticateAiStudioRequest(request)),
    kind: 'api-key' as const,
  };

  // A bound key spends on the app's unmetered allocation, so it has to satisfy
  // the same registration the app's session tokens do. Checking only at issuance
  // would let a key keep working after the app was disabled, unlinked from the
  // workspace, or had the scope for this operation withdrawn — and speech in
  // particular is gated on `tts:use` rather than the default `ai:use`.
  const boundAppId = credential.apiKey.external_app_id?.trim();
  if (boundAppId) {
    const sbAdmin = await createAdminClient({ noCookie: true });
    const registration = await loadExternalAppRegistration(sbAdmin, boundAppId);
    if (
      !externalAppRegistrationAllows(
        registration,
        credential.workspaceId,
        requiredScope
      )
    ) {
      throw invalidExternalCredential(
        'The external app this key is bound to is not enabled, linked to this workspace, or authorized for this operation.'
      );
    }
  }

  return credential;
}
