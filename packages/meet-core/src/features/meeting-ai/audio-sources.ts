import type { MeetRealtimePresence } from '@tuturuuu/realtime/meet';
import type { RemoteMedia } from '../call/lib/remote-streams';
import type { MeetAudioSource } from './audio';

/**
 * Audio the host records for transcription. Other participants are included
 * only when their account has allowed transcription for the current session;
 * anyone without a decision, or who declined, is excluded. The server applies
 * the same rule to every upload, so this is a bandwidth and privacy filter,
 * not the enforcement point.
 */
export function meetingAudioSources(input: {
  localStream: MediaStream | null;
  screenStream: MediaStream | null;
  remoteMedia: RemoteMedia;
  participants: Record<string, MeetRealtimePresence>;
  selfUserId: string | null;
  /** The host's own account, used before presence arrives. */
  selfAccountId?: string;
  /** Accounts with a current allow decision for this session. */
  allowedAccountIds?: ReadonlySet<string>;
  /** False when the host declined their own transcription. */
  selfAllowed?: boolean;
}): MeetAudioSource[] {
  const own = input.selfUserId
    ? input.participants[input.selfUserId]
    : undefined;
  const ownAccountId = own?.accountId ?? input.selfAccountId;
  const includeSelf = input.selfAllowed !== false;
  // Mirrors the server: host screen audio can carry other people's voices, so
  // it is left out once more than one other person is in the call.
  const includeScreen =
    includeSelf && Object.keys(input.participants).length <= 2;
  return [
    ...(input.localStream && includeSelf
      ? [
          {
            stream: input.localStream,
            accountId: ownAccountId,
            kind: 'microphone' as const,
          },
        ]
      : []),
    ...(input.screenStream && includeScreen
      ? [
          {
            stream: input.screenStream,
            accountId: ownAccountId,
            kind: 'shared_audio' as const,
          },
        ]
      : []),
    ...Object.entries(input.remoteMedia).flatMap(([id, tracks]) => {
      const person = input.participants[id];
      const accountId = person?.accountId;
      if (!accountId || !input.allowedAccountIds?.has(accountId)) return [];
      return [
        ...(tracks.audio
          ? [
              {
                stream: new MediaStream([tracks.audio]),
                accountId,
                kind: 'microphone' as const,
              },
            ]
          : []),
        ...(tracks.screen_audio && person.media.screenEnabled
          ? [
              {
                stream: new MediaStream([tracks.screen_audio]),
                accountId,
                kind: 'shared_audio' as const,
              },
            ]
          : []),
      ];
    }),
  ];
}
