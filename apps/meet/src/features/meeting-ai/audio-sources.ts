import type { MeetRealtimePresence } from '@tuturuuu/realtime/meet';
import type { RemoteMedia } from '../call/lib/remote-streams';
import type { MeetAudioSource } from './audio';

export function meetingAudioSources(input: {
  localStream: MediaStream | null;
  screenStream: MediaStream | null;
  remoteMedia: RemoteMedia;
  participants: Record<string, MeetRealtimePresence>;
  selfUserId: string | null;
}): MeetAudioSource[] {
  const own = input.selfUserId
    ? input.participants[input.selfUserId]
    : undefined;
  return [
    ...(input.localStream
      ? [
          {
            stream: input.localStream,
            accountId: own?.accountId,
            kind: 'microphone' as const,
          },
        ]
      : []),
    ...(input.screenStream
      ? [
          {
            stream: input.screenStream,
            accountId: own?.accountId,
            kind: 'shared_audio' as const,
          },
        ]
      : []),
    ...Object.entries(input.remoteMedia).flatMap(([id, tracks]) => {
      const person = input.participants[id];
      return [
        ...(tracks.audio
          ? [
              {
                stream: new MediaStream([tracks.audio]),
                accountId: person?.accountId,
                kind: 'microphone' as const,
              },
            ]
          : []),
        ...(tracks.screen_audio && person?.media.screenEnabled
          ? [
              {
                stream: new MediaStream([tracks.screen_audio]),
                accountId: person.accountId,
                kind: 'shared_audio' as const,
              },
            ]
          : []),
      ];
    }),
  ];
}
