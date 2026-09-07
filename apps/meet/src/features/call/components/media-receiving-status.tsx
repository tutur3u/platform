'use client';
import { AudioLines, Loader2, Video } from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useEffect, useReducer } from 'react';
import {
  RECEIVER_PACKET_EVENT,
  streamPacketState,
} from '../lib/receiver-packet-state';

export function useStreamReadiness(stream?: MediaStream | null) {
  const [, refresh] = useReducer((value: number) => value + 1, 0);
  useEffect(() => {
    const tracks = stream?.getTracks() ?? [];
    for (const track of tracks)
      for (const event of ['mute', 'unmute', 'ended', RECEIVER_PACKET_EVENT])
        track.addEventListener(event, refresh);
    return () => {
      for (const track of tracks)
        for (const event of ['mute', 'unmute', 'ended', RECEIVER_PACKET_EVENT])
          track.removeEventListener(event, refresh);
    };
  }, [stream]);
  const receiving = (track: MediaStreamTrack) =>
    track.readyState === 'live' && !track.muted;
  return {
    receivingAudio: streamPacketState(stream?.getAudioTracks() ?? []),
    receivingVideo: streamPacketState(stream?.getVideoTracks() ?? []),
    audio: stream?.getAudioTracks().some(receiving) ?? false,
    video: stream?.getVideoTracks().some(receiving) ?? false,
  };
}
export function MediaReceivingStatus({
  audio,
  video,
  expectAudio,
  expectVideo,
}: {
  audio: boolean | undefined;
  video: boolean | undefined;
  expectAudio: boolean;
  expectVideo: boolean;
}) {
  const t = useTranslations('meet.call');
  return (
    <div className="flex shrink-0 items-center gap-1">
      {(
        [
          {
            expected: expectAudio,
            ready: audio,
            Icon: AudioLines,
            label: 'receiving_audio',
          },
          {
            expected: expectVideo,
            ready: video,
            Icon: Video,
            label: 'receiving_video',
          },
        ] as const
      ).map(
        ({ expected, ready, Icon, label }) =>
          expected && (
            <span
              role="img"
              key={label}
              title={t(
                ready === undefined
                  ? 'media_connected'
                  : ready
                    ? label
                    : 'waiting_media'
              )}
              aria-label={t(
                ready === undefined
                  ? 'media_connected'
                  : ready
                    ? label
                    : 'waiting_media'
              )}
              className={cn(
                'rounded-full bg-background/60 p-1',
                ready === undefined
                  ? 'text-muted-foreground'
                  : ready
                    ? 'text-dynamic-green'
                    : 'text-dynamic-orange'
              )}
            >
              {ready !== false ? (
                <Icon className="size-3" />
              ) : (
                <Loader2 className="size-3 motion-safe:animate-spin" />
              )}
            </span>
          )
      )}
    </div>
  );
}
