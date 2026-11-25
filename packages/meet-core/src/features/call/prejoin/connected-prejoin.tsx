'use client';

import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ConnectedLobbyProps } from '../components/call-lobby';
import { resourceErrorKey } from '../components/call-resource-notice';
import { GuestLobbyUpgrade } from '../components/guest-lobby-upgrade';
import { useGuestVerification } from '../components/guest-verification-context';
import { prepareParticipantName } from '../lib/participant-name';
import { GuestAdmissionStage } from './guest-admission-stage';
import { forgetGuestMedia, guestMediaRequest } from './guest-prejoin-media';
import { PrejoinNameField } from './prejoin-name-field';
import { usePrejoinInfo } from './prejoin-context';
import { PrejoinParticipants } from './prejoin-participants';
import { PrejoinStage, type PrejoinPhase } from './prejoin-stage';
import { PrejoinTitle } from './prejoin-title';
import type { PrejoinCapture } from './use-prejoin-capture';

/**
 * The connected pre-join stage: the same room wiring as the original lobby
 * (name sent with presence and devices handed to the room on Join) in
 * the redesigned layout.
 */
export function ConnectedPrejoin({
  capture,
  room,
  participants,
  defaultAvatarUrl,
  defaultDisplayName,
  canReadWorkspace,
  guestRequest = false,
  joined,
  meetingName,
  transcriptionNotice,
  onOutputDeviceChange,
  prepareJoin,
  runMediaAction,
  onJoined,
  onLeave,
  onRetry,
  miraMeetingId,
}: ConnectedLobbyProps & { capture: PrejoinCapture }) {
  const t = useTranslations('meet.call');
  const viewer = room.state.role === 'viewer';
  const presenceOnly = room.state.settings.transport === 'presence';
  const { setLimit } = capture;
  const limit =
    presenceOnly || viewer
      ? 'blocked'
      : room.state.role === null
        ? 'pending'
        : 'none';
  useEffect(() => setLimit(limit), [limit, setLimit]);

  // Raw text as typed; only prepareParticipantName() output leaves the stage.
  const [customName, setCustomName] = useState<string | null>(null);
  const displayName = customName ?? prepareParticipantName(defaultDisplayName);
  const guest = !canReadWorkspace;
  const verification = useGuestVerification();
  // Last name sent with presence.join, so a blur followed by join does not resend it.
  const sentDisplayName = useRef<string | null>(null);
  const sendDisplayName = useCallback((name: string) => {
    if (name === sentDisplayName.current) return;
    sentDisplayName.current = name;
    room.setDisplayName(name, room.media);
  }, [room]);

  const { error } = room.state;
  const { connectionStatus } = room;
  const resourceKey = resourceErrorKey(error);
  const connectionError = resourceKey
    ? t(resourceKey)
    : connectionStatus === 'closed' || connectionStatus === 'error' || error
      ? t('join_error_hint')
      : null;
  const meetingId = usePrejoinInfo()?.meetingId ?? miraMeetingId;
  const { handedOff, reset, finish } = capture;
  // A dropped connection leaves the devices with the room; take them back for the
  // retry. A resource refusal can clear and admit the person, so it does not.
  useEffect(() => {
    if (connectionError && !resourceKey && handedOff) reset();
  }, [connectionError, resourceKey, handedOff, reset]);
  // Admission, leaving or an error screen ends the stage: nothing may stay live.
  useEffect(() => finish, [finish]);
  const waiting = room.state.admission === 'waiting';
  const connecting = room.state.admission === 'connecting';
  const trimmed = prepareParticipantName(displayName);
  const admitted =
    room.state.admission === 'admitted' && connectionStatus === 'open';
  const canHandOff =
    limit !== 'pending' && capture.limited === (limit === 'blocked');
  const [guestRequestMedia] = useState(() =>
    meetingId ? guestMediaRequest(meetingId) : undefined
  );
  const [permissionChoice, setPermissionChoice] = useState<{
    audio: boolean;
    video: boolean;
  } | null>(null);
  const audioPending = !!guestRequestMedia?.audioPermissionPending && capture.audioPermissionPending;
  const videoPending = !!guestRequestMedia?.videoPermissionPending && capture.videoPermissionPending;
  const started = useRef(false);

  const phase: PrejoinPhase = connectionError
    ? {
        kind: 'error',
        label: t('connection_refresh'),
        message: connectionError,
      }
    : waiting
      ? { kind: 'waiting', label: t('waiting_for_host') }
      : connecting || joined
        ? { kind: 'connecting', label: t('join_now') }
        : { kind: 'ready', label: t('join_now'), disabled: !trimmed };

  const join = useCallback(() => {
    if (connectionError) {
      onRetry();
      return;
    }
    if (!admitted || !canHandOff || !trimmed || started.current) return;
    if (guestRequest && limit === 'none' && (audioPending || videoPending)) return;
    started.current = true;
    if (guestRequest && meetingId) forgetGuestMedia(meetingId);
    const media = capture.handOff();
    onOutputDeviceChange(media.outputDeviceId);
    if (guest || trimmed !== defaultDisplayName) sendDisplayName(trimmed);
    const enableMicrophone = prepareJoin(media.audioEnabled);
    onJoined();
    void Promise.all([
      room.selectDevice('audio', media.audioDeviceId),
      room.selectDevice('video', media.videoDeviceId),
    ])
      .then(() => room.adoptPreview(media.previewStream))
      .then(() =>
        Promise.all([
          ...(enableMicrophone
            ? [runMediaAction(room.toggleMicrophone, 'microphone')]
            : []),
          ...(media.videoEnabled
            ? [runMediaAction(room.toggleCamera, 'camera')]
            : []),
        ])
      )
      .catch(() => toast.error(t('media_failed')));
  }, [
    admitted,
    audioPending,
    canHandOff,
    capture,
    connectionError,
    defaultDisplayName,
    guest,
    guestRequest,
    limit,
    meetingId,
    onJoined,
    onOutputDeviceChange,
    onRetry,
    prepareJoin,
    room,
    runMediaAction,
    sendDisplayName,
    t,
    trimmed,
    videoPending,
  ]);

  useEffect(() => {
    if (!guestRequest || !admitted || joined || connectionError || !canHandOff) return;
    if (limit === 'none' && (audioPending || videoPending)) {
      setPermissionChoice((current) => current ?? { audio: audioPending, video: videoPending });
      return;
    }
    if (!permissionChoice || limit === 'blocked') join();
  }, [admitted, audioPending, canHandOff, connectionError, guestRequest, join, joined, limit, permissionChoice, videoPending]);

  const leave = () => {
    if (guestRequest && meetingId) forgetGuestMedia(meetingId);
    capture.release();
    onLeave();
  };

  const nameField = (
    <PrejoinNameField
      disabled={connecting}
      hint={t('lobby_guest_name_hint')}
      id="prejoin-display-name"
      label={t('your_name')}
      onBlur={() => {
        if (customName !== null) setCustomName(trimmed);
        if (trimmed) sendDisplayName(trimmed);
      }}
      onChange={setCustomName}
      placeholder={t('lobby_guest_name_placeholder')}
      value={displayName}
    />
  );

  if (guestRequest && !connectionError) {
    const choosing = admitted && canHandOff && limit === 'none' &&
      (!!permissionChoice || audioPending || videoPending);
    return (
      <GuestAdmissionStage
        phase={choosing ? 'confirm' : admitted ? 'admitted' : waiting ? 'waiting' : 'joining'}
        name={trimmed || defaultDisplayName}
        verified={verification?.verified === true}
        verification={<GuestLobbyUpgrade room={room} displayName={trimmed} />}
        fields={nameField}
        media={[
          ...(permissionChoice?.audio || audioPending
            ? [{ kind: 'microphone' as const, enabled: capture.audioEnabled, toggle: capture.toggleAudio }]
            : []),
          ...(permissionChoice?.video || videoPending
            ? [{ kind: 'camera' as const, enabled: capture.videoEnabled, toggle: capture.toggleVideo }]
            : []),
        ]}
        joinDisabled={audioPending || videoPending || !trimmed}
        onJoin={join}
        onLeave={leave}
      />
    );
  }

  return (
    <PrejoinStage
      avatarUrl={defaultAvatarUrl}
      capture={capture}
      fields={
        guest ? nameField : (
          <p className="text-sm">
            <span className="text-muted-foreground">{t('joining_as')} </span>
            <span className="break-words font-medium">{displayName}</span>
          </p>
        )
      }
      name={displayName}
      notice={
        <>
          {transcriptionNotice ? (
            <output className="block rounded-xl border bg-muted/20 p-3 text-sm">
              {transcriptionNotice}
            </output>
          ) : null}
          {waiting ? (
            <GuestLobbyUpgrade room={room} displayName={defaultDisplayName} />
          ) : null}
        </>
      }
      onPresenceChange={
        room.state.role === 'host'
          ? (enabled) =>
              room.updateSettings({ transport: enabled ? 'presence' : 'media' })
          : undefined
      }
      back={{
        label: t(waiting ? 'join_cancel_request' : 'prejoin.back'),
        onClick: leave,
      }}
      onSubmit={join}
      phase={phase}
      presenceOnly={presenceOnly}
      summary={
        <PrejoinParticipants
          connected={connectionStatus === 'open'}
          participants={participants}
          waiting={waiting}
        />
      }
      title={room.state.title ?? meetingName}
      titleEditor={
        room.state.role === 'host' && meetingId ? (
          <PrejoinTitle
            meetingId={meetingId}
            onSaved={room.renameMeeting}
            title={room.state.title ?? meetingName}
          />
        ) : undefined
      }
      viewer={viewer}
    />
  );
}
