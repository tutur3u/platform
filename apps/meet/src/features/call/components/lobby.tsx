'use client';

import { Loader2, Mic, MicOff, Video, VideoOff } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

/**
 * Pre-join check. Nothing is published until the user presses join, so the
 * preview stream stays entirely local — the same contract Google Meet offers.
 */
export function Lobby({
  defaultDisplayName,
  isJoining,
  meetingName,
  onJoin,
  waiting,
}: {
  defaultDisplayName: string;
  isJoining: boolean;
  meetingName: string;
  onJoin: (options: {
    audioEnabled: boolean;
    displayName: string;
    videoEnabled: boolean;
  }) => void;
  waiting: boolean;
}) {
  const t = useTranslations('meet.call');
  const [displayName, setDisplayName] = useState(defaultDisplayName);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const cameraBlockedMessage = t('camera_blocked');

  useEffect(() => {
    if (!videoEnabled) {
      // Functional update so the stop always targets the current stream rather
      // than one captured by a stale closure.
      setStream((current) => {
        for (const track of current?.getTracks() ?? []) track.stop();
        return null;
      });
      return;
    }

    let cancelled = false;
    let acquired: MediaStream | null = null;

    navigator.mediaDevices
      .getUserMedia({ video: true })
      .then((next) => {
        acquired = next;
        if (cancelled) {
          for (const track of next.getTracks()) track.stop();
          return;
        }
        setPreviewError(null);
        setStream(next);
      })
      .catch(() => {
        if (!cancelled) {
          setPreviewError(cameraBlockedMessage);
          setVideoEnabled(false);
        }
      });

    return () => {
      cancelled = true;
      for (const track of acquired?.getTracks() ?? []) track.stop();
    };
  }, [cameraBlockedMessage, videoEnabled]);

  useEffect(() => {
    const element = videoRef.current;
    if (element && element.srcObject !== stream) element.srcObject = stream;
  }, [stream]);

  return (
    <div className="grid min-h-dvh place-items-center bg-background p-4">
      <div className="grid w-full max-w-4xl gap-8 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] md:items-center">
        <div className="relative aspect-video overflow-hidden rounded-2xl bg-foreground/5 ring-1 ring-border">
          {stream ? (
            <video
              autoPlay
              className="size-full -scale-x-100 object-cover"
              muted
              playsInline
              ref={videoRef}
            />
          ) : (
            <div className="grid size-full place-items-center text-muted-foreground text-sm">
              {previewError ?? t('camera_is_off')}
            </div>
          )}

          <div className="absolute inset-x-0 bottom-0 flex justify-center gap-2 p-3">
            <Button
              aria-label={audioEnabled ? t('mute') : t('unmute')}
              aria-pressed={!audioEnabled}
              className={cn(
                'size-11 rounded-full',
                !audioEnabled &&
                  'bg-dynamic-red text-white hover:bg-dynamic-red/90'
              )}
              onClick={() => setAudioEnabled((value) => !value)}
              size="icon"
              type="button"
              variant={audioEnabled ? 'secondary' : 'default'}
            >
              {audioEnabled ? (
                <Mic className="size-5" />
              ) : (
                <MicOff className="size-5" />
              )}
            </Button>
            <Button
              aria-label={videoEnabled ? t('camera_off') : t('camera_on')}
              aria-pressed={!videoEnabled}
              className={cn(
                'size-11 rounded-full',
                !videoEnabled &&
                  'bg-dynamic-red text-white hover:bg-dynamic-red/90'
              )}
              onClick={() => setVideoEnabled((value) => !value)}
              size="icon"
              type="button"
              variant={videoEnabled ? 'secondary' : 'default'}
            >
              {videoEnabled ? (
                <Video className="size-5" />
              ) : (
                <VideoOff className="size-5" />
              )}
            </Button>
          </div>
        </div>

        <div className="min-w-0">
          <h1 className="text-balance font-semibold text-2xl tracking-tight">
            {meetingName}
          </h1>
          <p className="mt-2 text-muted-foreground text-sm">
            {waiting ? t('lobby_waiting_hint') : t('lobby_hint')}
          </p>

          <div className="mt-5 space-y-2">
            <Label htmlFor="display-name">{t('your_name')}</Label>
            <Input
              id="display-name"
              maxLength={120}
              onChange={(event) => setDisplayName(event.target.value)}
              value={displayName}
            />
          </div>

          <Button
            className="mt-5 w-full"
            disabled={isJoining || waiting || !displayName.trim()}
            onClick={() => {
              for (const track of stream?.getTracks() ?? []) track.stop();
              onJoin({
                audioEnabled,
                displayName: displayName.trim(),
                videoEnabled,
              });
            }}
            size="lg"
            type="button"
          >
            {isJoining || waiting ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : null}
            {waiting ? t('asking_to_join') : t('join_now')}
          </Button>
        </div>
      </div>
    </div>
  );
}
