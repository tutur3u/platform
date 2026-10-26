import { publishChannelBroadcast } from '@tuturuuu/realtime/channels/server';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { connection, type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
import {
  pomodoroCommandSchema,
  pomodoroConfigSchema,
} from '@/lib/time-tracking/pomodoro-control';
import {
  commandPomodoro,
  configurePomodoro,
  type PomodoroControlRow,
  type PomodoroDeps,
  type PomodoroResponse,
  type PomodoroStore,
  PomodoroStoreError,
  pomodoroTopic,
  readPomodoro,
} from '@/lib/time-tracking/pomodoro-service';
import { normalizeWorkspaceId } from '@/lib/workspace-helper';

const noStore = { 'Cache-Control': 'no-store' };
const PUBLISH_TIMEOUT_MS = 2000;

const configureSchema = z.object({
  commandId: z.guid(),
  expectedRevision: z.number().int().min(0),
  config: pomodoroConfigSchema,
});

type RpcError = { code?: string; message?: string } | null;
type PrivateRpc = {
  schema(name: 'private'): {
    rpc(
      name: string,
      args: Record<string, unknown>
    ): PromiseLike<{ data: unknown; error: RpcError }>;
  };
};

function storeError(error: NonNullable<RpcError>): PomodoroStoreError {
  const message = error.message ?? '';
  switch (error.code) {
    case '42501':
      return new PomodoroStoreError('forbidden');
    case '40001':
      if (/command conflict/i.test(message))
        return new PomodoroStoreError('command_conflict');
      if (/running session conflict/i.test(message))
        return new PomodoroStoreError('timer_running');
      return new PomodoroStoreError('revision_conflict');
    case '22023':
    case '55000':
      return new PomodoroStoreError('invalid');
    default:
      console.error('Pomodoro control RPC failed:', error);
      return new PomodoroStoreError('unavailable');
  }
}

function createStore(
  db: PrivateRpc,
  wsId: string,
  userId: string
): PomodoroStore {
  const call = async (name: string, args: Record<string, unknown>) => {
    const { data, error } = await db.schema('private').rpc(name, {
      p_ws_id: wsId,
      p_actor_id: userId,
      ...args,
    });
    if (error) throw storeError(error);
    return data as PomodoroControlRow | null;
  };
  return {
    read: () => call('read_time_tracker_control', {}),
    configure: async ({ expectedRevision, commandId, config }) =>
      (await call('configure_time_tracker_control', {
        p_expected_revision: expectedRevision,
        p_command_id: commandId,
        p_config: config,
      })) as PomodoroControlRow,
    apply: async ({ expectedRevision, commandId, command, next, effects }) =>
      (await call('command_time_tracker_pomodoro', {
        p_expected_revision: expectedRevision,
        p_command_id: commandId,
        p_command: command,
        p_next: next,
        p_effects: effects,
      })) as PomodoroControlRow,
  };
}

async function publisher(topic: string, revision: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      publishChannelBroadcast(topic, {
        type: 'broadcast',
        event: 'pomodoro:changed',
        payload: { revision },
      }),
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('timeout')),
          PUBLISH_TIMEOUT_MS
        );
      }),
    ]);
  } catch (error) {
    // Clients also re-read on foreground; a missed broadcast only delays.
    console.warn('Pomodoro broadcast failed:', error);
  } finally {
    clearTimeout(timer);
  }
}

async function depsFor(
  request: NextRequest,
  wsIdParam: string,
  userId: string,
  supabase: Parameters<typeof normalizeWorkspaceId>[1]
): Promise<PomodoroDeps> {
  const wsId = await normalizeWorkspaceId(wsIdParam, supabase, request);
  const admin = await createAdminClient({ noCookie: true });
  const topic = pomodoroTopic(wsId, userId);
  return {
    store: createStore(admin as unknown as PrivateRpc, wsId, userId),
    now: () => new Date(),
    newId: () => crypto.randomUUID(),
    publish: (revision) => publisher(topic, revision),
  };
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
  }
);

export const POST = withSessionAuth<{ wsId: string }>(
  async (request, { user, supabase }, { wsId }) => {
    const parsed = pomodoroCommandSchema.safeParse(await readBody(request));
    if (!parsed.success)
      return respond({ status: 400, body: { error: 'invalid_command' } });
    const deps = await depsFor(request, wsId, user.id, supabase);
    return respond(await commandPomodoro(deps, parsed.data));
  }
);

export const PUT = withSessionAuth<{ wsId: string }>(
  async (request, { user, supabase }, { wsId }) => {
    const parsed = configureSchema.safeParse(await readBody(request));
    if (!parsed.success)
      return respond({ status: 400, body: { error: 'invalid_config' } });
    const deps = await depsFor(request, wsId, user.id, supabase);
    return respond(await configurePomodoro(deps, parsed.data));
  }
);
