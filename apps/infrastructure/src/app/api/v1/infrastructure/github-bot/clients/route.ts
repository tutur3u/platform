import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  GitHubBotStoreError,
  issueGitHubBotWatcherClient,
} from '@/lib/infrastructure/github-bot';
import {
  authorizeGitHubBotAdmin,
  validateJsonGitHubBotMutation,
} from '@/lib/infrastructure/github-bot-access';

const IssueClientSchema = z.object({
  expiresInDays: z.coerce.number().int().min(1).max(365).default(90),
  name: z.string().trim().min(1).max(120),
});

function errorResponse(error: unknown) {
  if (error instanceof GitHubBotStoreError) {
    return NextResponse.json(
      { code: error.code, message: error.message },
      { status: error.status }
    );
  }

  return NextResponse.json(
    { message: 'Failed to issue GitHub bot watcher token' },
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { message: 'Invalid request body' },
      { status: 400 }
    );
  }

  const parsed = IssueClientSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { errors: parsed.error.issues, message: 'Invalid request body' },
      { status: 400 }
    );
  }

  try {
    return NextResponse.json(
      await issueGitHubBotWatcherClient({
        db: access.db,
        expiresInDays: parsed.data.expiresInDays,
        name: parsed.data.name,
        userId: access.userId,
      })
    );
  } catch (error) {
    return errorResponse(error);
  }
}
