import { NextResponse } from 'next/server';
import {
  enableGitHubBotWatcherAutoPickup,
  GitHubBotStoreError,
} from '@/lib/infrastructure/github-bot';
import {
  authorizeGitHubBotAdmin,
  validateJsonGitHubBotMutation,
} from '@/lib/infrastructure/github-bot-access';

function resolveTokenEndpointUrl(request: Request) {
  const requestUrl = new URL(request.url);
  return new URL(
    '/api/v1/infrastructure/github-bot/installation-token',
    requestUrl.origin
  ).toString();
}

function errorResponse(error: unknown) {
  if (error instanceof GitHubBotStoreError) {
    return NextResponse.json(
      { code: error.code, message: error.message },
      { status: error.status }
    );
  }

  return NextResponse.json(
    { message: 'Failed to enable GitHub bot watcher auto-pickup' },
    { status: 500 }
  );
}

export async function POST(request: Request) {
  const mutationError = validateJsonGitHubBotMutation(request);
  if (mutationError) {
    return mutationError;
  }

  const access = await authorizeGitHubBotAdmin(request);
  if (!access.ok) {
    return access.response;
  }

  try {
    return NextResponse.json(
      await enableGitHubBotWatcherAutoPickup({
        db: access.db,
        tokenEndpointUrl: resolveTokenEndpointUrl(request),
        userId: access.userId,
      })
    );
  } catch (error) {
    return errorResponse(error);
  }
}
