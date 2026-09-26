import 'server-only';

import { resolveSatelliteRequestActor } from '@tuturuuu/satellite/workspace-access';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';

export const GITHUB_BOT_CSRF_HEADER = 'x-tuturuuu-github-bot-action';

export type GitHubBotAdminAccess =
  | {
      db: Awaited<ReturnType<typeof createAdminClient>>;
      ok: true;
      userId: string;
    }
  | {
      ok: false;
      response: NextResponse;
    };

function jsonMessage(message: string, status: number) {
  return NextResponse.json({ message }, { status });
}

export async function authorizeGitHubBotAdmin(
  request: Request
): Promise<GitHubBotAdminAccess> {
  const actor = await resolveSatelliteRequestActor(request, 'infra');

  if (!actor) {
    return {
      ok: false,
      response: jsonMessage('Unauthorized', 401),
    };
  }

  const permissions = await getPermissions({
    user: actor.user,
    wsId: ROOT_WORKSPACE_ID,
  });

  if (
    !permissions ||
    permissions.withoutPermission('manage_workspace_secrets')
  ) {
    return {
      ok: false,
      response: jsonMessage('Forbidden', 403),
    };
  }

  return {
    db: await createAdminClient({ noCookie: true }),
    ok: true,
    userId: actor.user.id,
  };
}

export function validateSameOriginGitHubBotMutation(request: Request) {
  const url = new URL(request.url);
  const origin = request.headers.get('origin');

  if (!origin || origin !== url.origin) {
    return jsonMessage('Forbidden', 403);
  }

  if (request.headers.get(GITHUB_BOT_CSRF_HEADER) !== '1') {
    return jsonMessage('Forbidden', 403);
  }

  return null;
}

export function validateJsonGitHubBotMutation(request: Request) {
  const csrfResponse = validateSameOriginGitHubBotMutation(request);
  if (csrfResponse) {
    return csrfResponse;
  }

  const contentType = request.headers.get('content-type') || '';
  if (!contentType.toLowerCase().startsWith('application/json')) {
    return jsonMessage('Unsupported media type', 415);
  }

  return null;
}
