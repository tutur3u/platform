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
  commit: (result: MeetRoomOutcome) => void;
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
      options.commit(applyMeetRoomCommand(options.read(), command));
      return Promise.resolve();
    }
    const key = `${command.token.roomId}:${command.token.userId}`;
    const task = (this.pending.get(key) ?? Promise.resolve()).then(() =>
      this.execute(command, options)
    );
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
      options.commit(planned);
      return;
    }
    try {
      if (!options.read().presence[command.token.userId])
        throw new Error('participant_left');
      const result = await options.runSfu(planned.sfu);
      assertSfuSuccess(result);
      const current = options.read();
      if (current.ended || !current.presence[command.token.userId])
        throw new Error('participant_left');
      // Rebase only this completed operation onto the latest presence/settings state.
      const confirmed = applyMeetRoomCommand(current, command);
      if (!confirmed.sfu) {
        options.commit(confirmed);
        return;
      }
      const response: MeetRealtimeServerMessage = {
        type: 'sfu.response',
        action: planned.sfu.message.type,
        requestId: planned.sfu.requestId,
        result,
      };
      options.commit({
        ...confirmed,
        sfu: null,
        reply: [...confirmed.reply, response],
      });
    } catch (error) {
      options.commit(
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
    }
  }
}
