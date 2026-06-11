import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import {
  GitHubBotStoreError,
  issueGitHubInstallationTokenForWatcher,
} from '@/lib/infrastructure/github-bot';

function getBearerToken(request: Request) {
  const authorization = request.headers.get('authorization') || '';
  const match = authorization.match(/^Bearer\s+(.+)$/iu);
  return match?.[1]?.trim() || null;
}

function errorResponse(error: unknown) {
  if (error instanceof GitHubBotStoreError) {
    return NextResponse.json(
      { code: error.code, message: error.message },
      {
        headers: { 'Cache-Control': 'no-store' },
        status: error.status,
      }
    );
  }

  return NextResponse.json(
    { message: 'Failed to issue GitHub installation token' },
    {
      headers: { 'Cache-Control': 'no-store' },
      status: 500,
    }
  );
}

export async function POST(request: Request) {
  const watcherToken = getBearerToken(request);
  if (!watcherToken) {
    return NextResponse.json(
      { code: 'invalid_token', message: 'Unauthorized' },
      {
        headers: { 'Cache-Control': 'no-store' },
        status: 401,
      }
    );
  }

  try {
    return NextResponse.json(
      await issueGitHubInstallationTokenForWatcher({
        db: await createAdminClient({ noCookie: true }),
        watcherToken,
      }),
      {
        headers: { 'Cache-Control': 'no-store' },
      }
    );
  } catch (error) {
    return errorResponse(error);
  }
}
