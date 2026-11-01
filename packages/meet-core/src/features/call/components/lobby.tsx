'use client';

import { Loader2, Mic, MicOff, Video, VideoOff } from '@tuturuuu/icons';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { MAX_DISPLAY_NAME_LENGTH } from '@tuturuuu/utils/constants';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import {
  startMicrophoneMeter,
  stopMediaStream,
  useLobbyMediaDevices,
} from '../lib/lobby-media';
import { prepareParticipantName } from '../lib/participant-name';
import type { MeetSignalingStatus } from '../lib/signaling';
import { AdmissionNotice } from './admission-notice';
import { resourceErrorKey } from './call-resource-notice';
import {
  LobbyDevicePickers,
  LobbyMicMeter,
  type LobbyParticipant,
  LobbyParticipantSummary,
} from './lobby-controls';

export type { LobbyParticipant } from './lobby-controls';

export interface LobbyJoinOptions {
  previewStream: MediaStream | null;
  audioEnabled: boolean;
  displayName: string;
  videoEnabled: boolean;
  audioDeviceId: string;
  videoDeviceId: string;
  outputDeviceId: string;
}

/**
 * Pre-join check. Nothing is published until the user presses join, so the
 * preview stream stays entirely local — the same contract Google Meet offers.
 */
export function Lobby({
  defaultDisplayName,
  avatarUrl,
  connectionStatus,
  error,
  isGuest = false,
  isJoining,
  meetingName,
  participants = [],
  transcriptionNotice,
  initialAudioDeviceId = '',
  initialVideoDeviceId = '',
  outputDeviceId,
  onOutputDeviceChange,
  onDisplayNameChange,
  onJoin,
  onLeave,
  onRetry,
  waiting,
}: {
  defaultDisplayName: string;
  avatarUrl?: string;
  isGuest?: boolean;
  isJoining: boolean;
  meetingName: string;
  participants?: readonly LobbyParticipant[];
  transcriptionNotice?: string;
  initialAudioDeviceId?: string;
  initialVideoDeviceId?: string;
  outputDeviceId?: string;
  onOutputDeviceChange?: (deviceId: string) => void;
  onDisplayNameChange?: (displayName: string) => void;
  /** Set when signaling could not be reached, so the CTA can explain itself. */
  connectionStatus: MeetSignalingStatus;
  error: string | null;
  onRetry: () => void;
  onJoin: (options: LobbyJoinOptions) => void;
  onLeave: () => void;
  waiting: boolean;
}) {
  const t = useTranslations('meet.call');
  const [customName, setCustomName] = useState<string | null>(null);
  const displayName = customName ?? prepareParticipantName(defaultDisplayName);

  const resourceKey = resourceErrorKey(error);
  const connectionError = resourceKey
    ? t(resourceKey)
    : connectionStatus === 'closed' || connectionStatus === 'error' || error
      ? t('join_error_hint')
      : null;

  const { devices, refreshDevices } = useLobbyMediaDevices();
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(false);
  const [audioDeviceId, setAudioDeviceId] = useState(initialAudioDeviceId);
  const [videoDeviceId, setVideoDeviceId] = useState(initialVideoDeviceId);
  const [localOutputId, setLocalOutputId] = useState('');
  const activeOutputId = outputDeviceId ?? localOutputId;

  const [previewError, setPreviewError] = useState<string | null>(null);
  const [micError, setMicError] = useState<string | null>(null);
  const [micLevel, setMicLevel] = useState(0);
  const [stream, setStream] = useState<MediaStream | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const transferred = useRef<MediaStream | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);

  const cameraBlockedMessage = t('camera_blocked');
  const micBlockedMessage = t('lobby_mic_blocked');

  useEffect(() => {
    if (!videoEnabled) return;
    if (
      typeof navigator === 'undefined' ||
      typeof navigator.mediaDevices?.getUserMedia !== 'function'
    )
      return;

    let cancelled = false;
    let acquired: MediaStream | null = null;
    const videoConstraint = videoDeviceId
      ? {
          deviceId: { exact: videoDeviceId },
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 24 },
        }
      : true;

    navigator.mediaDevices
      .getUserMedia({ video: videoConstraint })
      .then((next) => {
        acquired = next;
        if (cancelled) {
          stopMediaStream(next);
          return;
        }
        setPreviewError(null);
        setStream(next);
        void refreshDevices();
      })
      .catch(() => {
        if (!cancelled) {
          setPreviewError(cameraBlockedMessage);
          setVideoEnabled(false);
        }
      });

    return () => {
      cancelled = true;
      if (transferred.current !== acquired) stopMediaStream(acquired);
    };
  }, [cameraBlockedMessage, refreshDevices, videoDeviceId, videoEnabled]);

  useEffect(() => {
    if (!audioEnabled) return;
    if (
      typeof navigator === 'undefined' ||
      typeof navigator.mediaDevices?.getUserMedia !== 'function'
    )
      return;

    let cancelled = false;
    let acquired: MediaStream | null = null;
    let stopMeter: (() => void) | undefined;

    navigator.mediaDevices
      .getUserMedia({
        audio: audioDeviceId ? { deviceId: { exact: audioDeviceId } } : true,
      })
      .then((next) => {
        acquired = next;
        if (cancelled) {
          stopMediaStream(next);
          return;
        }
        setMicError(null);
        micStreamRef.current = next;
        stopMeter = startMicrophoneMeter(next, setMicLevel);
        void refreshDevices();
      })
      .catch(() => {
        if (!cancelled) {
          setMicError(micBlockedMessage);
          setMicLevel(0);
          setAudioEnabled(false);
        }
      });

    return () => {
      cancelled = true;
      stopMeter?.();
      stopMediaStream(acquired);
      if (micStreamRef.current === acquired) micStreamRef.current = null;
      setMicLevel(0);
    };
  }, [audioDeviceId, audioEnabled, micBlockedMessage, refreshDevices]);

  const activeStream = videoEnabled ? stream : null;
  useEffect(() => {
    const element = videoRef.current;
    if (element && element.srcObject !== activeStream)
      element.srcObject = activeStream;
  }, [activeStream]);

  const submitJoin = () => {
    if (connectionError) {
      onRetry();
      return;
    }
    const trimmed = displayName.trim();
    if (isJoining || waiting || !trimmed) return;
    stopMediaStream(micStreamRef.current);
    micStreamRef.current = null;
    setMicLevel(0);
    transferred.current = activeStream;
    onJoin({
      previewStream: activeStream,
      audioEnabled,
      displayName: trimmed,
      videoEnabled,
      audioDeviceId,
      videoDeviceId,
      outputDeviceId: activeOutputId,
    });
  };

  const initial = displayName.trim().slice(0, 1).toUpperCase() || '?';

  return (
    <div className="grid min-h-dvh items-center overflow-y-auto bg-background px-4 py-6 sm:px-6 lg:px-10">
      <div className="mx-auto grid w-full max-w-6xl items-start gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(21rem,0.8fr)] lg:items-center lg:gap-10">
        <div className="min-w-0 space-y-4">
          <div className="relative aspect-video w-full min-w-0 overflow-hidden rounded-2xl bg-foreground/5 ring-1 ring-border">
            {activeStream ? (
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
                  <Avatar className="size-20">
                    <AvatarImage alt="" src={avatarUrl} />
                    <AvatarFallback className="font-medium text-xl">
                      {initial}
                    </AvatarFallback>
                  </Avatar>
                  <div className="space-y-1">
                    <p>{previewError ?? t('camera_is_off')}</p>
                    {micError && !audioEnabled ? (
                      <p className="text-xs">{micError}</p>
                    ) : null}
                  </div>
                </div>
              </div>
            )}

            <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-background/70 via-background/20 to-transparent p-3">
              <LobbyMicMeter audioEnabled={audioEnabled} level={micLevel} />
              <div className="flex items-center gap-2">
                <Button
                  aria-label={audioEnabled ? t('mute') : t('unmute')}
                  aria-pressed={!audioEnabled}
                  className={cn(
                    'size-11 rounded-full',
                    !audioEnabled &&
                      'bg-dynamic-red text-white hover:bg-dynamic-red/90'
                  )}
                  onClick={() => {
                    if (audioEnabled) setMicLevel(0);
                    setAudioEnabled((value) => !value);
                  }}
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
                  onClick={() => {
                    if (videoEnabled) setStream(null);
                    setVideoEnabled((value) => !value);
                  }}
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
              <div aria-hidden="true" className="hidden w-20 sm:block" />
            </div>
          </div>

          <LobbyDevicePickers
            audioDeviceId={audioDeviceId}
            devices={devices}
            disabled={isJoining}
            onAudioDeviceChange={setAudioDeviceId}
            onOutputDeviceChange={(next) => {
              setLocalOutputId(next);
              onOutputDeviceChange?.(next);
            }}
            onVideoDeviceChange={setVideoDeviceId}
            outputDeviceId={activeOutputId}
            videoDeviceId={videoDeviceId}
          />
        </div>

        <div className="flex min-w-0 flex-col rounded-2xl border bg-card p-5 shadow-xs sm:p-6">
          <section aria-labelledby="meeting-details-title" className="min-w-0">
            <p className="font-medium text-muted-foreground text-xs">
              {t('ready_to_join')}
            </p>
            <h1
              className="mt-1 text-balance font-semibold text-2xl tracking-tight sm:text-3xl"
              id="meeting-details-title"
            >
              {meetingName}
            </h1>

            <LobbyParticipantSummary
              connected={connectionStatus === 'open'}
              participants={participants}
              waiting={waiting}
            />

            {transcriptionNotice ? (
              <output className="mt-3 block rounded-lg border bg-muted/20 p-3 text-sm">
                {transcriptionNotice}
              </output>
            ) : null}

            <AdmissionNotice
              connecting={isJoining}
              error={connectionError}
              waiting={waiting}
            />

            {isGuest ? (
              <div className="mt-5 space-y-2">
                <Label htmlFor="lobby-display-name">{t('your_name')}</Label>
                <Input
                  autoComplete="name"
                  disabled={isJoining}
                  id="lobby-display-name"
                  maxLength={MAX_DISPLAY_NAME_LENGTH}
                  onBlur={() => {
                    const trimmed = displayName.trim();
                    if (trimmed) onDisplayNameChange?.(trimmed);
                  }}
                  onChange={(event) =>
                    setCustomName(prepareParticipantName(event.target.value))
                  }
                  onKeyDown={(event) => {
                    if (
                      event.key === 'Enter' &&
                      !event.nativeEvent.isComposing
                    ) {
                      event.preventDefault();
                      submitJoin();
                    }
                  }}
                  placeholder={t('lobby_guest_name_placeholder')}
                  value={displayName}
                />
                <p className="text-muted-foreground text-xs">
                  {t('lobby_guest_name_hint')} {t('preview_private')}
                </p>
              </div>
            ) : (
              <div className="mt-5 space-y-1">
                <p className="text-muted-foreground text-xs">
                  {t('joining_as')}
                </p>
                <p className="break-words font-medium text-sm">{displayName}</p>
                <p className="text-muted-foreground text-xs">
                  {t('preview_private')}
                </p>
              </div>
            )}
          </section>

          <Button
            className="mt-5 w-full shrink-0"
            disabled={
              !connectionError && (isJoining || waiting || !displayName.trim())
            }
            onClick={submitJoin}
            size="lg"
            type="button"
          >
            {isJoining && !waiting && !connectionError ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : null}
            {connectionError
              ? t('connection_refresh')
              : waiting
                ? t('waiting_for_host')
                : isJoining
                  ? t('connecting')
                  : t('join_now')}
          </Button>
          <Button
            className="mt-2 w-full shrink-0"
            onClick={() => {
              stopMediaStream(micStreamRef.current);
              micStreamRef.current = null;
              stopMediaStream(stream);
              onLeave();
            }}
            type="button"
            variant="ghost"
          >
            {t(waiting ? 'join_cancel_request' : 'leave')}
          </Button>
        </div>
      </div>
    </div>
  );
}
