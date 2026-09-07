'use client';
import { AudioLines, Loader2, Video } from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useEffect, useReducer } from 'react';

export function useStreamReadiness(stream?: MediaStream | null) {
  const [, refresh] = useReducer((value: number) => value + 1, 0);
  useEffect(() => {
    const tracks = stream?.getTracks() ?? [];
    for (const track of tracks)
      for (const event of ['mute', 'unmute', 'ended'])
        track.addEventListener(event, refresh);
    return () => {
      for (const track of tracks)
        for (const event of ['mute', 'unmute', 'ended'])
          track.removeEventListener(event, refresh);
    };
  }, [stream]);
  const receiving = (track: MediaStreamTrack) =>
    track.readyState === 'live' && !track.muted;
  return {
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
  audio: boolean;
  video: boolean;
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
              title={t(ready ? label : 'waiting_media')}
              aria-label={t(ready ? label : 'waiting_media')}
              className={cn(
                'rounded-full bg-background/60 p-1',
                ready ? 'text-dynamic-green' : 'text-dynamic-orange'
              )}
            >
              {ready ? (
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
