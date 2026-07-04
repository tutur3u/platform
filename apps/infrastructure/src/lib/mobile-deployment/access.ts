import 'server-only';

import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { MOBILE_DEPLOYMENT_VAULT_PERMISSION } from './constants';

export const MOBILE_DEPLOYMENT_CSRF_HEADER =
  'x-tuturuuu-mobile-deployment-action';

export type MobileDeploymentAdminAccess =
  | {
      db: Awaited<ReturnType<typeof createAdminClient>>;
      ok: true;
      userId: string;
    }
  | {
      ok: false;
      response: NextResponse;
    };

function jsonMessage(message: string, status: number, code?: string) {
  return NextResponse.json({ code, message }, { status });
}

function firstForwardedHeaderValue(value: string | null) {
  return (
    value
      ?.split(',')
      .map((entry) => entry.trim())
      .find(Boolean) ?? null
  );
}

function resolveForwardedOrigin(request: Request) {
  const forwardedHost = firstForwardedHeaderValue(
    request.headers.get('x-forwarded-host')
  );

  if (!forwardedHost) {
    return null;
  }

  const forwardedProto = firstForwardedHeaderValue(
    request.headers.get('x-forwarded-proto')
  )
    ?.replace(/:$/u, '')
    .toLowerCase();
  const protocol =
    forwardedProto === 'http' || forwardedProto === 'https'
      ? forwardedProto
      : 'https';

  try {
    return new URL(`${protocol}://${forwardedHost}`).origin;
  } catch {
    return null;
  }
}

function normalizeOrigin(value: string | null) {
  if (!value) {
    return null;
  }

  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function normalizeConfiguredOrigins(value: string | undefined) {
  return (value ?? '')
    .split(/[,\n]/u)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) =>
      normalizeOrigin(/^[a-z]+:\/\//iu.test(entry) ? entry : `https://${entry}`)
    )
    .filter((origin): origin is string => Boolean(origin));
}

function resolveConfiguredWebOrigins() {
  return [
    process.env.WEB_APP_URL,
    process.env.NEXT_PUBLIC_WEB_APP_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.COOLIFY_URL,
    process.env.COOLIFY_FQDN,
    'https://tuturuuu.com',
  ].flatMap(normalizeConfiguredOrigins);
}

function resolveMutationRequestOrigins(request: Request) {
  return [
    normalizeOrigin(request.url),
    resolveForwardedOrigin(request),
    ...resolveConfiguredWebOrigins(),
  ].filter((origin): origin is string => Boolean(origin));
}

export async function authorizeMobileDeploymentAdmin(
  request: Request
): Promise<MobileDeploymentAdminAccess> {
  const supabase = await createClient(request);
  const { user } = await resolveAuthenticatedSessionUser(supabase);

  if (!user) {
    return {
      ok: false,
      response: jsonMessage(
        'Unauthorized',
        401,
        'mobile_deployment_unauthorized'
      ),
    };
  }

  const permissions = await getPermissions({
    request,
    wsId: ROOT_WORKSPACE_ID,
  });

  if (
    !permissions ||
    permissions.withoutPermission(MOBILE_DEPLOYMENT_VAULT_PERMISSION)
  ) {
    return {
      ok: false,
      response: jsonMessage(
        'You need root mobile deployment vault permission to edit mobile deployment resources.',
        403,
        'mobile_deployment_forbidden'
      ),
    };
  }

  return {
    db: await createAdminClient({ noCookie: true }),
    ok: true,
    userId: user.id,
  };
}

export function validateSameOriginMutation(request: Request) {
  const rawOrigin = request.headers.get('origin');
  const origin = normalizeOrigin(rawOrigin);

  if (request.headers.get(MOBILE_DEPLOYMENT_CSRF_HEADER) !== '1') {
    return jsonMessage(
      'Mobile deployment action header is required.',
      403,
      'mobile_deployment_csrf_required'
    );
  }

  if (
    rawOrigin &&
    (!origin || !resolveMutationRequestOrigins(request).includes(origin))
  ) {
    return jsonMessage(
      'Mobile deployment actions must be submitted from the same origin.',
      403,
      'mobile_deployment_origin_forbidden'
    );
  }

  return null;
}

export function validateJsonMutation(request: Request) {
  const csrfResponse = validateSameOriginMutation(request);
  if (csrfResponse) {
    return csrfResponse;
  }

  const contentType = request.headers.get('content-type') || '';
  if (!contentType.toLowerCase().startsWith('application/json')) {
    return jsonMessage('Unsupported media type', 415, 'unsupported_media_type');
  }

  return null;
}

export function validateMultipartMutation(request: Request) {
  const csrfResponse = validateSameOriginMutation(request);
  if (csrfResponse) {
    return csrfResponse;
  }

  const contentType = request.headers.get('content-type') || '';
  if (!contentType.toLowerCase().startsWith('multipart/form-data')) {
    return jsonMessage('Unsupported media type', 415, 'unsupported_media_type');
  }

  return null;
}
