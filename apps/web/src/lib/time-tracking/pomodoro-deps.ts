import { publishChannelBroadcast } from '@tuturuuu/realtime/channels/server';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  type PomodoroControlRow,
  type PomodoroDeps,
  type PomodoroStore,
  PomodoroStoreError,
  pomodoroTopic,
} from './pomodoro-service';
import {
  bridgeTimerSessionAction,
  switchPomodoroOff,
  type TimerSessionAction,
  type TimerSessionRef,
} from './pomodoro-timer-bridge';

/**
 * The Next.js adapter for the Pomodoro service: the private functions through
 * the service role, the realtime publisher and the clock. `wsId` must already
 * be normalized; the private functions check MEMBER themselves.
 */

const PUBLISH_TIMEOUT_MS = 2000;

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

export async function createPomodoroDeps(
  wsId: string,
  userId: string
): Promise<PomodoroDeps> {
  const admin = await createAdminClient({ noCookie: true });
  const topic = pomodoroTopic(wsId, userId);
  return {
    store: createStore(admin as unknown as PrivateRpc, wsId, userId),
    now: () => new Date(),
    newId: () => crypto.randomUUID(),
    publish: (revision) => publisher(topic, revision),
  };
}

/** For the Timer's start: switches the actor's Pomodoro OFF first. */
export async function switchPomodoroOffForTimer(wsId: string, userId: string) {
  try {
    await switchPomodoroOff(await createPomodoroDeps(wsId, userId));
  } catch (error) {
    console.warn('Could not switch the Pomodoro off for the Timer:', error);
  }
}

/** For the Timer's stop, pause and resume (see the bridge). */
export async function bridgeTimerAction(
  wsId: string,
  userId: string,
  action: TimerSessionAction,
  session: TimerSessionRef
) {
  try {
    return await bridgeTimerSessionAction(
      await createPomodoroDeps(wsId, userId),
      action,
      session
    );
  } catch (error) {
    console.warn(
      'Could not route the Timer action through the Pomodoro:',
      error
    );
    return null;
  }
}
