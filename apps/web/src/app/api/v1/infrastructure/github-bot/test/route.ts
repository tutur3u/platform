import { NextResponse } from 'next/server';
import {
  GitHubBotStoreError,
  testGitHubBotConfiguration,
} from '@/lib/infrastructure/github-bot';
import {
  authorizeGitHubBotAdmin,
  validateJsonGitHubBotMutation,
} from '@/lib/infrastructure/github-bot-access';

function errorResponse(error: unknown) {
  if (error instanceof GitHubBotStoreError) {
    return NextResponse.json(
      { code: error.code, message: error.message },
      { status: error.status }
    );
  }

  return NextResponse.json(
    { message: 'Failed to validate GitHub bot configuration' },
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
      await testGitHubBotConfiguration({
        db: access.db,
        userId: access.userId,
      })
    );
  } catch (error) {
    return errorResponse(error);
  }
}
