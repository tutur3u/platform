import { connection, type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
import {
  pomodoroCommandSchema,
  pomodoroConfigSchema,
} from '@/lib/time-tracking/pomodoro-control';
import { createPomodoroDeps } from '@/lib/time-tracking/pomodoro-deps';
import {
  commandPomodoro,
  configurePomodoro,
  type PomodoroResponse,
  PomodoroStoreError,
  readPomodoro,
} from '@/lib/time-tracking/pomodoro-service';
import { normalizeWorkspaceId } from '@/lib/workspace-helper';

const noStore = { 'Cache-Control': 'no-store' };

const configureSchema = z.object({
  commandId: z.guid(),
  expectedRevision: z.number().int().min(0),
  config: pomodoroConfigSchema,
});

async function depsFor(
  request: NextRequest,
  wsIdParam: string,
  userId: string,
  supabase: Parameters<typeof normalizeWorkspaceId>[1]
) {
  const wsId = await normalizeWorkspaceId(wsIdParam, supabase, request);
  return createPomodoroDeps(wsId, userId);
}

const respond = ({ status, body }: PomodoroResponse) =>
  NextResponse.json(body, { status, headers: noStore });

async function readBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

export const GET = withSessionAuth<{ wsId: string }>(
  async (request, { user, supabase }, { wsId }) => {
    await connection();
    const deps = await depsFor(request, wsId, user.id, supabase);
    try {
      return respond(await readPomodoro(deps));
    } catch (error) {
      if (!(error instanceof PomodoroStoreError)) throw error;
      return respond({
        status: error.code === 'forbidden' ? 403 : 503,
        body: { error: error.code },
      });
    }
  },
  { allowAppSessionAuth: true }
);

export const POST = withSessionAuth<{ wsId: string }>(
  async (request, { user, supabase }, { wsId }) => {
    const parsed = pomodoroCommandSchema.safeParse(await readBody(request));
    if (!parsed.success)
      return respond({ status: 400, body: { error: 'invalid_command' } });
    const deps = await depsFor(request, wsId, user.id, supabase);
    return respond(await commandPomodoro(deps, parsed.data));
  },
  { allowAppSessionAuth: true }
);

export const PUT = withSessionAuth<{ wsId: string }>(
  async (request, { user, supabase }, { wsId }) => {
    const parsed = configureSchema.safeParse(await readBody(request));
    if (!parsed.success)
      return respond({ status: 400, body: { error: 'invalid_config' } });
    const deps = await depsFor(request, wsId, user.id, supabase);
    return respond(await configurePomodoro(deps, parsed.data));
  },
  { allowAppSessionAuth: true }
);
