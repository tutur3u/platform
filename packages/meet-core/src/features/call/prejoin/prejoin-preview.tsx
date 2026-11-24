'use client';

import { Mic, MicOff, Settings2, Video, VideoOff } from '@tuturuuu/icons';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Button } from '@tuturuuu/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { startMicrophoneMeter } from '../lib/lobby-media';
import {
  LobbyDevicePickers,
  LobbyMicMeter,
} from '../components/lobby-controls';
import type { PrejoinCapture } from './use-prejoin-capture';

/** Owns the meter level so sampling re-renders only the meter. */
function LiveMicMeter({
  audioEnabled,
  stream,
}: {
  audioEnabled: boolean;
  stream: MediaStream | null;
}) {
  const [level, setLevel] = useState(0);
  useEffect(() => {
    if (!stream) return;
    return startMicrophoneMeter(stream, setLevel);
  }, [stream]);
  return <LobbyMicMeter audioEnabled={audioEnabled} level={level} />;
}

/** Camera preview with the mic, camera and device controls on its edge. */
export function PrejoinPreview({
  capture,
  avatarUrl,
  name,
  viewer = false,
  presenceOnly = false,
  className,
}: {
  capture: PrejoinCapture;
  avatarUrl?: string;
  name: string;
  viewer?: boolean;
  presenceOnly?: boolean;
  className?: string;
}) {
  const t = useTranslations('meet.call');
  const videoRef = useRef<HTMLVideoElement>(null);
  const { previewStream, handedOff, limited } = capture;
  useEffect(() => {
    const element = videoRef.current;
    if (element && element.srcObject !== previewStream)
      element.srcObject = previewStream;
  }, [previewStream]);
  const locked = handedOff || limited;
  const initial = name.trim().slice(0, 1).toUpperCase() || '?';
  return (
    <section
      aria-label={t('prejoin.preview')}
      className={cn('min-w-0 space-y-2', className)}
    >
      <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-muted ring-1 ring-border">
        {previewStream ? (
          <video
            autoPlay
            className="size-full -scale-x-100 object-contain"
            muted
            playsInline
            ref={videoRef}
          />
        ) : (
          <div className="grid size-full place-items-center px-4 pb-12 text-center text-muted-foreground text-sm">
            <div className="grid justify-items-center gap-3">
              <Avatar className="size-16 sm:size-20">
                <AvatarImage alt="" src={avatarUrl} />
                <AvatarFallback className="font-medium text-xl">
                  {initial}
                </AvatarFallback>
              </Avatar>
              {!presenceOnly && (
                <p>{capture.previewError ?? t('camera_is_off')}</p>
              )}
            </div>
          </div>
        )}
        {!presenceOnly && (
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-linear-to-t from-background/70 via-background/20 to-transparent p-3">
            {handedOff ? (
              <div aria-hidden="true" className="h-9" />
            ) : (
              <LiveMicMeter
                audioEnabled={capture.audioEnabled}
                stream={capture.micStream}
              />
            )}
            <div className="flex items-center gap-2">
              <Button
                aria-label={
                  viewer
                    ? t('viewer_mic_unavailable')
                    : t(capture.audioEnabled ? 'mute' : 'unmute')
                }
                aria-pressed={!capture.audioEnabled}
                className={cn(
                  'size-10 rounded-full pointer-coarse:size-11',
                  !capture.audioEnabled &&
                    'bg-dynamic-red text-white hover:bg-dynamic-red/90'
                )}
                disabled={locked}
                onClick={capture.toggleAudio}
                size="icon"
                type="button"
                variant={capture.audioEnabled ? 'secondary' : 'default'}
              >
                {capture.audioEnabled ? (
                  <Mic aria-hidden="true" className="size-5" />
                ) : (
                  <MicOff aria-hidden="true" className="size-5" />
                )}
              </Button>
              <Button
                aria-label={
                  viewer
                    ? t('viewer_camera_unavailable')
                    : t(capture.videoEnabled ? 'camera_off' : 'camera_on')
                }
                aria-pressed={!capture.videoEnabled}
                className={cn(
                  'size-10 rounded-full pointer-coarse:size-11',
                  !capture.videoEnabled &&
                    'bg-dynamic-red text-white hover:bg-dynamic-red/90'
                )}
                disabled={locked}
                onClick={capture.toggleVideo}
                size="icon"
                type="button"
                variant={capture.videoEnabled ? 'secondary' : 'default'}
              >
                {capture.videoEnabled ? (
                  <Video aria-hidden="true" className="size-5" />
                ) : (
                  <VideoOff aria-hidden="true" className="size-5" />
                )}
              </Button>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    aria-label={t('prejoin.devices')}
                    className="size-10 rounded-full pointer-coarse:size-11"
                    disabled={handedOff}
                    size="icon"
                    type="button"
                    variant="secondary"
                  >
                    <Settings2 aria-hidden="true" className="size-5" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  align="end"
                  className="w-[min(20rem,calc(100vw-2rem))] space-y-3"
                >
                  <LobbyDevicePickers
                    audioDeviceId={capture.audioDeviceId}
                    devices={capture.devices}
                    onAudioDeviceChange={capture.setAudioDeviceId}
                    onOutputDeviceChange={capture.setOutputDeviceId}
                    onVideoDeviceChange={capture.setVideoDeviceId}
                    outputDeviceId={capture.outputDeviceId}
                    videoDeviceId={capture.videoDeviceId}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
        )}
      </div>
      {capture.micError && !capture.audioEnabled ? (
        <output className="block text-muted-foreground text-xs">
          {capture.micError}
        </output>
      ) : null}
    </section>
  );
}
