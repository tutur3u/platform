import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  GitHubBotStoreError,
  listGitHubBotState,
  saveGitHubBotConfiguration,
} from '@/lib/infrastructure/github-bot';
import {
  authorizeGitHubBotAdmin,
  validateJsonGitHubBotMutation,
} from '@/lib/infrastructure/github-bot-access';

const SaveConfigurationSchema = z.object({
  appId: z
    .string()
    .trim()
    .regex(/^[0-9]+$/u)
    .max(40),
  enabled: z.boolean().default(false),
  installationId: z
    .string()
    .trim()
    .regex(/^[0-9]+$/u)
    .max(40),
  privateKey: z
    .string()
    .max(64 * 1024)
    .optional()
    .transform((value) => {
      const trimmed = value?.trim();
      return trimmed ? value : undefined;
    }),
  repositoryName: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_.-]{1,100}$/u),
  repositoryOwner: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_.-]{1,100}$/u),
});

function errorResponse(error: unknown, fallbackMessage: string) {
  if (error instanceof GitHubBotStoreError) {
    return NextResponse.json(
      { code: error.code, message: error.message },
      { status: error.status }
    );
  }

  return NextResponse.json({ message: fallbackMessage }, { status: 500 });
}

export async function GET(request: Request) {
  const access = await authorizeGitHubBotAdmin(request);
  if (!access.ok) {
    return access.response;
  }

  try {
    return NextResponse.json(await listGitHubBotState(access.db));
  } catch (error) {
    return errorResponse(error, 'Failed to load GitHub bot configuration');
  }
}

export async function PUT(request: Request) {
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

  const parsed = SaveConfigurationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { errors: parsed.error.issues, message: 'Invalid request body' },
      { status: 400 }
    );
  }

  try {
    return NextResponse.json(
      await saveGitHubBotConfiguration({
        db: access.db,
        payload: parsed.data,
        userId: access.userId,
      })
    );
  } catch (error) {
    return errorResponse(error, 'Failed to save GitHub bot configuration');
  }
}
