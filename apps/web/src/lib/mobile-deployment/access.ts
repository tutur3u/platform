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
  const url = new URL(request.url);
  const origin = request.headers.get('origin');

  if (request.headers.get(MOBILE_DEPLOYMENT_CSRF_HEADER) !== '1') {
    return jsonMessage(
      'Mobile deployment action header is required.',
      403,
      'mobile_deployment_csrf_required'
    );
  }

  if (origin && origin !== url.origin) {
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
