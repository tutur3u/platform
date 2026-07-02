import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  GitHubBotStoreError,
  revokeGitHubBotWatcherClient,
} from '@/lib/infrastructure/github-bot';
import {
  authorizeGitHubBotAdmin,
  validateSameOriginGitHubBotMutation,
} from '@/lib/infrastructure/github-bot-access';

const ParamsSchema = z.object({
  clientId: z.guid(),
});

function errorResponse(error: unknown) {
  if (error instanceof GitHubBotStoreError) {
    return NextResponse.json(
      { code: error.code, message: error.message },
      { status: error.status }
    );
  }

  return NextResponse.json(
    { message: 'Failed to revoke GitHub bot watcher token' },
    { status: 500 }
  );
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ clientId: string }> }
) {
  const mutationError = validateSameOriginGitHubBotMutation(request);
  if (mutationError) {
    return mutationError;
  }

  const access = await authorizeGitHubBotAdmin(request);
  if (!access.ok) {
    return access.response;
  }

  const parsed = ParamsSchema.safeParse(await params);
  if (!parsed.success) {
    return NextResponse.json({ message: 'Invalid client id' }, { status: 400 });
  }

  try {
    return NextResponse.json(
      await revokeGitHubBotWatcherClient({
        clientId: parsed.data.clientId,
        db: access.db,
        userId: access.userId,
      })
    );
  } catch (error) {
    return errorResponse(error);
  }
}
