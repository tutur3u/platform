import { applyLiveQa } from './live-qa';
import type { MeetRealtimeServerMessage } from './messages';
import {
  applyMeetRoomCommand,
  type MeetRoomCommand,
  type MeetRoomOutcome,
  type MeetRoomSnapshot,
  type MeetSfuIntent,
} from './room';
import { queueUncommittedPublication } from './room-cleanup';
import { outcome } from './room-outcome';
import { takeActorRateLimit } from './actor-rate-limit';
import { MEET_MEDIA_QUALITY_REPORTS_PER_MINUTE } from './room-media-quality';
import { LAYER_UPDATE_RATE_LIMITED } from './room-sfu';

/** Layer update batches a receiver may send per minute. */
export const MEET_LAYER_UPDATES_PER_MINUTE = 40;
/** Room media health reads a manager may make per minute (UI polls at 15 s). */
export const MEET_MEDIA_QUALITY_READS_PER_MINUTE = 10;

/** Replies for a request over its per-actor limit, or undefined to admit it. */
function admissionRefusal(
  command: MeetRoomCommand
): MeetRealtimeServerMessage[] | undefined {
  const { message, token } = command;
  const limit =
    message.type === 'sfu.tracks.update'
      ? MEET_LAYER_UPDATES_PER_MINUTE
      : message.type === 'media.quality'
        ? MEET_MEDIA_QUALITY_REPORTS_PER_MINUTE
        : message.type === 'media.quality.read'
          ? MEET_MEDIA_QUALITY_READS_PER_MINUTE
          : null;
  if (
    limit === null ||
    takeActorRateLimit(
      `${message.type}:${token.roomId}:${token.userId}`,
      limit,
      60_000
    )
  )
    return undefined;
  // A dropped health report needs no answer; requests get a correlated one.
  if (
    message.type !== 'sfu.tracks.update' &&
    message.type !== 'media.quality.read'
  )
    return [];
  return [
    {
      type: 'error',
      requestId: message.requestId,
      error:
        message.type === 'sfu.tracks.update'
          ? LAYER_UPDATE_RATE_LIMITED
          : 'media_quality_rate_limited',
    },
  ];
}

type CommandOptions = {
  read: () => MeetRoomSnapshot;
  commit: (result: MeetRoomOutcome) => void | Promise<void>;
  runSfu: (intent: MeetSfuIntent) => Promise<unknown>;
};
function assertSfuSuccess(result: unknown, allowPartialTracks: boolean) {
  const response = result as {
    errorCode?: string;
    tracks?: Array<{ errorCode?: string }>;
  } | null;
  if (
    !response ||
    response.errorCode ||
    (!allowPartialTracks && response.tracks?.some((track) => track.errorCode))
  )
    throw new Error('sfu_operation_failed');
}
/** Serialize one participant's SFU operations; unrelated participants and leave/end remain responsive. */
export class MeetCommandExecutor {
  private pending = new Map<string, Promise<void>>();
  run(command: MeetRoomCommand, options: CommandOptions): Promise<void> {
    // Charged once at admission, before room processing, any provider call
    // or queue wait. Refusals change no room state.
    const qa = applyLiveQa(options.read(), command);
    if (qa) return Promise.resolve(options.commit(qa));
    const refusal = admissionRefusal(command);
    // A silently dropped report never reaches the room or its storage.
    if (refusal?.length === 0) return Promise.resolve();
    if (refusal !== undefined)
      return Promise.resolve(
        options.commit(outcome(options.read(), { reply: refusal }))
      );
    if (
      !command.message.type.startsWith('sfu.') &&
      command.message.type !== 'media.idle'
    ) {
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
      // A partial pull may already have moved the SFU into have-local-offer.
      // Forward its SDP and per-track errors so the browser can finish negotiation.
      assertSfuSuccess(
        result,
        command.message.type === 'sfu.tracks.subscribe' ||
          command.message.type === 'sfu.tracks.update'
      );
      if (
        options.read().ended ||
        !options.read().presence[command.token.userId]
      )
        throw new Error('participant_left');
    } catch (error) {
      await options.commit(
        outcome(
          result !== undefined
            ? queueUncommittedPublication(options.read(), command, result)
            : options.read(),
          {
            reply: [
              {
                type: 'error',
                requestId: planned.sfu.requestId,
                error:
                  error instanceof Error ? error.message : 'sfu_request_failed',
              },
            ],
          }
        )
      );
      return;
    }
    const current = options.read();
    // Rebase only this completed operation onto the latest presence/settings state.
    const confirmed = applyMeetRoomCommand(current, command);
    if (!confirmed.sfu) {
      await options.commit({
        ...confirmed,
        state: queueUncommittedPublication(confirmed.state, command, result),
      });
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
