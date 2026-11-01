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
  filterDevicesByKind,
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

/**
 * Cap a name being typed to the profile limit without trimming, so spaces and
 * IME (Telex/VNI) edits survive each keystroke; trimming happens on blur/join.
 */
function capTypedName(value: string): string {
  if (value.length <= MAX_DISPLAY_NAME_LENGTH) return value;
  let name = '';
  for (const character of value) {
    if (name.length + character.length > MAX_DISPLAY_NAME_LENGTH) break;
    name += character;
  }
  return name;
}

/**
 * getUserMedia rejections meaning the requested device id no longer exists
 * (unplugged, or a stale id from a previous session), not a permission block.
 */
function isMissingDeviceError(error: unknown): boolean {
  const name = (error as { name?: unknown } | null)?.name;
  return name === 'OverconstrainedError' || name === 'NotFoundError';
}

/**
 * A selected id the browser no longer lists. Only trust the list once it has
 * labels for that kind (permission granted); before that ids may be hidden.
 */
function isUnlistedDevice(
  devices: readonly MediaDeviceInfo[],
  kind: MediaDeviceKind,
  deviceId: string
): boolean {
  if (!deviceId) return false;
  if (!devices.some((device) => device.kind === kind && device.label))
    return false;
  return !filterDevicesByKind(devices, kind).some(
    (device) => device.deviceId === deviceId
  );
}

/** Call `onEnded` when any track of `stream` ends (device unplugged/revoked). */
function watchTracksEnded(stream: MediaStream, onEnded: () => void) {
  const tracks = stream.getTracks?.() ?? [];
  for (const track of tracks) track.addEventListener?.('ended', onEnded);
  return () => {
    for (const track of tracks) track.removeEventListener?.('ended', onEnded);
  };
}

/**
 * Owns the ~16 Hz meter level so sampling re-renders only the meter, not the
 * whole lobby (preview, pickers, name form).
 */
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
  // Raw text as typed; only prepareParticipantName() output leaves the lobby.
  const [customName, setCustomName] = useState<string | null>(null);
  const composingName = useRef(false);
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
  // Bumped to re-acquire the system default after its track ended.
  const [micAttempt, setMicAttempt] = useState(0);
  const [cameraAttempt, setCameraAttempt] = useState(0);

  const [previewError, setPreviewError] = useState<string | null>(null);
  const [micError, setMicError] = useState<string | null>(null);
  const [micStream, setMicStream] = useState<MediaStream | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const transferred = useRef<MediaStream | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);

  // While a join request waits for the host, the room already owns the mic and
  // camera; the lobby must not open a second capture or switch devices.
  const mediaHandedOff = waiting;
  // Join pressed: the room is about to take the devices, so no toggling.
  const mediaLocked = mediaHandedOff || isJoining;

  const cameraBlockedMessage = t('camera_blocked');
  const micBlockedMessage = t('lobby_mic_blocked');

  // biome-ignore lint/correctness/useExhaustiveDependencies: cameraAttempt re-acquires the system default camera after its track ended.
  useEffect(() => {
    if (!videoEnabled || mediaHandedOff) return;
    if (
      typeof navigator === 'undefined' ||
      typeof navigator.mediaDevices?.getUserMedia !== 'function'
    )
      return;

    let cancelled = false;
    let acquired: MediaStream | null = null;
    let unwatch: (() => void) | undefined;
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
        unwatch = watchTracksEnded(next, () => {
          if (cancelled || transferred.current === next) return;
          setStream(null);
          if (videoDeviceId) setVideoDeviceId('');
          else setCameraAttempt((attempt) => attempt + 1);
          void refreshDevices();
        });
        void refreshDevices();
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        if (videoDeviceId && isMissingDeviceError(cause)) {
          // Stale or unplugged camera: retry with the system default.
          setVideoDeviceId('');
          void refreshDevices();
          return;
        }
        setPreviewError(cameraBlockedMessage);
        setVideoEnabled(false);
      });

    return () => {
      cancelled = true;
      unwatch?.();
      if (transferred.current !== acquired) stopMediaStream(acquired);
    };
  }, [
    cameraAttempt,
    cameraBlockedMessage,
    mediaHandedOff,
    refreshDevices,
    videoDeviceId,
    videoEnabled,
  ]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: micAttempt re-acquires the system default microphone after its track ended.
  useEffect(() => {
    if (!audioEnabled || mediaHandedOff) return;
    if (
      typeof navigator === 'undefined' ||
      typeof navigator.mediaDevices?.getUserMedia !== 'function'
    )
      return;

    let cancelled = false;
    let acquired: MediaStream | null = null;
    let unwatch: (() => void) | undefined;

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
        setMicStream(next);
        unwatch = watchTracksEnded(next, () => {
          if (cancelled || micStreamRef.current !== next) return;
          if (audioDeviceId) setAudioDeviceId('');
          else setMicAttempt((attempt) => attempt + 1);
          void refreshDevices();
        });
        void refreshDevices();
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        if (audioDeviceId && isMissingDeviceError(cause)) {
          // Stale or unplugged microphone: retry with the system default.
          setAudioDeviceId('');
          void refreshDevices();
          return;
        }
        setMicError(micBlockedMessage);
        setAudioEnabled(false);
      });

    return () => {
      cancelled = true;
      unwatch?.();
      stopMediaStream(acquired);
      if (micStreamRef.current === acquired) micStreamRef.current = null;
      setMicStream((current) => (current === acquired ? null : current));
    };
  }, [
    audioDeviceId,
    audioEnabled,
    mediaHandedOff,
    micAttempt,
    micBlockedMessage,
    refreshDevices,
  ]);

  // Once the browser lists labelled devices, drop selections it no longer has
  // (e.g. the initial id from a previous session) so pickers and capture agree.
  useEffect(() => {
    if (isUnlistedDevice(devices, 'audioinput', audioDeviceId))
      setAudioDeviceId('');
    if (isUnlistedDevice(devices, 'videoinput', videoDeviceId))
      setVideoDeviceId('');
    if (isUnlistedDevice(devices, 'audiooutput', activeOutputId)) {
      setLocalOutputId('');
      onOutputDeviceChange?.('');
    }
  }, [
    activeOutputId,
    audioDeviceId,
    devices,
    onOutputDeviceChange,
    videoDeviceId,
  ]);

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
    const trimmed = prepareParticipantName(displayName);
    if (isJoining || waiting || !trimmed) return;
    stopMediaStream(micStreamRef.current);
    micStreamRef.current = null;
    setMicStream(null);
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
                  <p>{previewError ?? t('camera_is_off')}</p>
                </div>
              </div>
            )}

            <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-background/70 via-background/20 to-transparent p-3">
              {mediaHandedOff ? (
                <div aria-hidden="true" className="w-20" />
              ) : (
                <LiveMicMeter audioEnabled={audioEnabled} stream={micStream} />
              )}
              <div className="flex items-center gap-2">
                <Button
                  aria-label={audioEnabled ? t('mute') : t('unmute')}
                  aria-pressed={!audioEnabled}
                  className={cn(
                    'size-11 rounded-full',
                    !audioEnabled &&
                      'bg-dynamic-red text-white hover:bg-dynamic-red/90'
                  )}
                  disabled={mediaLocked}
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
                  disabled={mediaLocked}
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

          {/* Outside the camera-off placeholder so it shows with the camera on. */}
          {micError && !audioEnabled ? (
            <output className="block text-muted-foreground text-xs">
              {micError}
            </output>
          ) : null}

          <LobbyDevicePickers
            audioDeviceId={audioDeviceId}
            devices={devices}
            disabled={mediaLocked}
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
                    const trimmed = prepareParticipantName(displayName);
                    if (customName !== null) setCustomName(trimmed);
                    if (trimmed) onDisplayNameChange?.(trimmed);
                  }}
                  onChange={(event) => {
                    const { value } = event.target;
                    // Leave IME composition text untouched until it commits.
                    setCustomName(
                      composingName.current ? value : capTypedName(value)
                    );
                  }}
                  onCompositionEnd={(event) => {
                    composingName.current = false;
                    setCustomName(capTypedName(event.currentTarget.value));
                  }}
                  onCompositionStart={() => {
                    composingName.current = true;
                  }}
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
