'use client';

import {
  Loader2,
  Mic,
  MicOff,
  TriangleAlert,
  Video,
  VideoOff,
} from '@tuturuuu/icons';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Button } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { AdmissionNotice } from './admission-notice';

/**
 * Pre-join check. Nothing is published until the user presses join, so the
 * preview stream stays entirely local — the same contract Google Meet offers.
 */
export function Lobby({
  defaultDisplayName,
  avatarUrl,
  connectionError,
  isJoining,
  meetingName,
  transcriptionNotice,
  onJoin,
  onLeave,
  waiting,
}: {
  defaultDisplayName: string;
  avatarUrl?: string;
  isJoining: boolean;
  meetingName: string;
  transcriptionNotice?: string;
  /** Set when signaling could not be reached, so the CTA can explain itself. */
  connectionError?: string | null;
  onJoin: (options: {
    previewStream: MediaStream | null;
    audioEnabled: boolean;
    displayName: string;
    videoEnabled: boolean;
  }) => void;
  onLeave: () => void;
  waiting: boolean;
}) {
  const t = useTranslations('meet.call');
  const displayName = defaultDisplayName;
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const transferred = useRef<MediaStream | null>(null);

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
      if (transferred.current !== acquired)
        for (const track of acquired?.getTracks() ?? []) track.stop();
    };
  }, [cameraBlockedMessage, videoEnabled]);

  useEffect(() => {
    const element = videoRef.current;
    if (element && element.srcObject !== stream) element.srcObject = stream;
  }, [stream]);

  return (
    <div className="grid h-dvh min-h-0 place-items-center overflow-hidden bg-background px-4 py-3 sm:py-5">
      <div className="grid max-h-full min-h-0 w-full max-w-5xl grid-rows-[minmax(0,auto)_minmax(0,1fr)] gap-4 md:h-full md:max-h-[32rem] md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] md:grid-rows-1 md:items-center md:gap-6">
        <div className="relative aspect-video max-h-[38dvh] overflow-hidden rounded-2xl bg-foreground/5 ring-1 ring-border md:max-h-[min(70dvh,28rem)] md:justify-self-stretch">
          {stream ? (
            <video
              autoPlay
              className="size-full -scale-x-100 object-contain"
              muted
              playsInline
              ref={videoRef}
            />
          ) : (
            <div className="grid size-full place-items-center pb-12 text-muted-foreground text-sm">
              <div className="grid justify-items-center gap-3">
                <Avatar className="size-20">
                  <AvatarImage src={avatarUrl} alt="" />
                  <AvatarFallback>{displayName.slice(0, 1)}</AvatarFallback>
                </Avatar>
                <span>{previewError ?? t('camera_is_off')}</span>
              </div>
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

        <div className="flex max-h-full min-h-0 min-w-0 flex-col">
          <div className="min-h-0 overflow-y-auto">
            <h1 className="text-balance font-semibold text-2xl tracking-tight">
              {meetingName}
            </h1>
            {transcriptionNotice ? (
              <p role="status" className="mt-3 rounded-md border p-3 text-sm">
                {transcriptionNotice}
              </p>
            ) : null}
            <AdmissionNotice waiting={waiting} connecting={isJoining} />

            {connectionError ? (
              <p className="mt-4 flex items-start gap-2 rounded-lg border border-dynamic-red/30 bg-dynamic-red/5 p-3 text-dynamic-red text-sm">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                <span>{connectionError}</span>
              </p>
            ) : null}

            <div className="mt-5 space-y-1">
              <p className="text-muted-foreground text-xs">{t('joining_as')}</p>
              <p className="break-words font-medium text-sm">{displayName}</p>
              <p className="text-muted-foreground text-xs">
                {t('preview_private')}
              </p>
            </div>
          </div>

          <Button
            className="mt-4 w-full shrink-0"
            disabled={isJoining || waiting || !displayName.trim()}
            onClick={() => {
              transferred.current = stream;
              onJoin({
                previewStream: stream,
                audioEnabled,
                displayName: displayName.trim(),
                videoEnabled,
              });
            }}
            size="lg"
            type="button"
          >
            {isJoining && !waiting ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : null}
            {waiting
              ? t('waiting_for_host')
              : isJoining
                ? t('connecting')
                : t('join_now')}
          </Button>
          <Button
            className="mt-2 w-full shrink-0"
            onClick={onLeave}
            type="button"
            variant="ghost"
          >
            {t('leave')}
          </Button>
        </div>
      </div>
    </div>
  );
}
