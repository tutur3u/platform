import type { MeetRealtimeServerMessage } from './messages';
import {
  applyMeetRoomCommand,
  type MeetRoomCommand,
  type MeetRoomOutcome,
  type MeetRoomSnapshot,
  type MeetSfuIntent,
} from './room';
import { outcome } from './room-outcome';

type CommandOptions = {
  read: () => MeetRoomSnapshot;
  commit: (result: MeetRoomOutcome) => void | Promise<void>;
  runSfu: (intent: MeetSfuIntent) => Promise<unknown>;
};
function assertSfuSuccess(result: unknown) {
  const response = result as {
    errorCode?: string;
    tracks?: Array<{ errorCode?: string }>;
  } | null;
  if (
    !response ||
    response.errorCode ||
    response.tracks?.some((track) => track.errorCode)
  )
    throw new Error('sfu_operation_failed');
}
/** Serialize one participant's SFU operations; unrelated participants and leave/end remain responsive. */
export class MeetCommandExecutor {
  private pending = new Map<string, Promise<void>>();
  run(command: MeetRoomCommand, options: CommandOptions): Promise<void> {
    if (!command.message.type.startsWith('sfu.')) {
      return Promise.resolve(
        options.commit(applyMeetRoomCommand(options.read(), command))
      );
    }
    const key = `${command.token.roomId}:${command.token.userId}`;
    const task = (this.pending.get(key) ?? Promise.resolve())
      .catch(() => undefined)
      .then(() => this.execute(command, options));
    this.pending.set(key, task);
    void task
      .finally(() => {
        if (this.pending.get(key) === task) this.pending.delete(key);
      })
      .catch(() => undefined);
    return task;
  }
  private async execute(command: MeetRoomCommand, options: CommandOptions) {
    const planned = applyMeetRoomCommand(options.read(), command);
    if (!planned.sfu) {
      await options.commit(planned);
      return;
    }
    let result: unknown;
    try {
      if (!options.read().presence[command.token.userId])
        throw new Error('participant_left');
      result = await options.runSfu(planned.sfu);
      assertSfuSuccess(result);
      if (
        options.read().ended ||
        !options.read().presence[command.token.userId]
      )
        throw new Error('participant_left');
    } catch (error) {
      await options.commit(
        outcome(options.read(), {
          reply: [
            {
              type: 'error',
              requestId: planned.sfu.requestId,
              error:
                error instanceof Error ? error.message : 'sfu_request_failed',
            },
          ],
        })
      );
      return;
    }
    const current = options.read();
    // Rebase only this completed operation onto the latest presence/settings state.
    const confirmed = applyMeetRoomCommand(current, command);
    if (!confirmed.sfu) {
      await options.commit(confirmed);
      return;
    }
    const response: MeetRealtimeServerMessage = {
      type: 'sfu.response',
      action: planned.sfu.message.type,
      requestId: planned.sfu.requestId,
      result,
    };
    await options.commit({
      ...confirmed,
      sfu: null,
      reply: [...confirmed.reply, response],
    });
  }
}
