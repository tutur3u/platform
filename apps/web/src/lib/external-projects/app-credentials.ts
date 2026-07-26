import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { NextResponse } from 'next/server';
import { verifyExternalAppSecret } from '@/lib/app-coordination/external-apps';
import { resolveWorkspaceExternalProjectBinding } from '@/lib/external-projects/access';

/**
 * Authorization for machine-to-machine calls made by a linked external project
 * (its own scheduled jobs and server actions), where there is no signed-in user
 * to speak for.
 *
 * Credentials travel in headers rather than the query string so the secret
 * never lands in a URL, access log, or referrer, and never in the body either —
 * that keeps the check identical for GET and POST.
 */
export type ExternalAppRequestAuthorization =
  | { binding?: never; response: NextResponse }
  | {
      appId: string;
      binding: Awaited<
        ReturnType<typeof resolveWorkspaceExternalProjectBinding>
      >;
      response?: never;
    };

export function readExternalAppCredentials(request: Request) {
  return {
    appId: (request.headers.get('x-app-id') ?? '').trim().toLowerCase(),
    appSecret: request.headers.get('x-app-secret')?.trim() ?? '',
  };
}

/**
 * Verify the caller owns the app that this workspace is bound to.
 *
 * Both halves matter: a valid secret proves which app is calling, and the
 * binding check proves that app is the one this workspace delegates to — so a
 * legitimately-issued secret for one project cannot reach another project's
 * workspace.
 */
export async function authorizeExternalAppRequest({
  admin,
  appId,
  appSecret,
  wsId,
}: {
  admin: TypedSupabaseClient;
  appId: string;
  appSecret: string;
  wsId: string;
}): Promise<ExternalAppRequestAuthorization> {
  if (!appSecret) {
    return {
      response: NextResponse.json(
        { error: 'Missing x-app-secret header' },
        { status: 401 }
      ),
    };
  }

  const verification = await verifyExternalAppSecret({ appId, appSecret });

  if (!verification.ok) {
    return {
      response: NextResponse.json(
        { error: verification.error },
        { status: 401 }
      ),
    };
  }

  const binding = await resolveWorkspaceExternalProjectBinding(wsId, admin);

  if (!binding.enabled || binding.adapter !== verification.app.id) {
    return {
      response: NextResponse.json(
        { error: 'App is not linked to this workspace' },
        { status: 403 }
      ),
    };
  }

  return { appId: verification.app.id, binding };
}
