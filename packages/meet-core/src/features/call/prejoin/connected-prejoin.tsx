'use client';

import { toast } from '@tuturuuu/ui/sonner';
import { useRememberMiraJoin } from '../../live-assistant/mira-join-box';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { prepareParticipantName } from '../lib/participant-name';
import { resourceErrorKey } from '../components/call-resource-notice';
import { GuestLobbyUpgrade } from '../components/guest-lobby-upgrade';
import {
  LobbyMiraBox,
  type ConnectedLobbyProps,
} from '../components/call-lobby';
import { PrejoinNameField } from './prejoin-name-field';
import { usePrejoinInfo } from './prejoin-context';
import { PrejoinParticipants } from './prejoin-participants';
import { PrejoinTitle } from './prejoin-title';
import { PrejoinStage, type PrejoinPhase } from './prejoin-stage';
import type { PrejoinCapture } from './use-prejoin-capture';

/**
 * The connected pre-join stage: the same room wiring as the original lobby
 * (name sent with presence, Mira choice remembered, devices handed to the
 * room on Join), in the redesigned layout.
 */
export function ConnectedPrejoin({
  capture,
  room,
  participants,
  defaultAvatarUrl,
  defaultDisplayName,
  canReadWorkspace,
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
  // Last name sent with presence.join, so a blur followed by join does not resend it.
  const sentDisplayName = useRef<string | null>(null);
  const sendDisplayName = (name: string) => {
    if (name === sentDisplayName.current) return;
    sentDisplayName.current = name;
    room.setDisplayName(name, room.media);
  };
  // The Mira box state; null until seeded, so the box renders on the client.
  const [miraTicked, setMiraTicked] = useState<boolean | null>(null);
  const rememberMira = useRememberMiraJoin();
  // The acceptance revision open on the join screen, kept by the Mira box.
  const miraRevision = useRef(0);

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

  const join = () => {
    if (connectionError) {
      onRetry();
      return;
    }
    if (connecting || waiting || !trimmed) return;
    const media = capture.handOff();
    onOutputDeviceChange(media.outputDeviceId);
    // Recorded after admission; until then the participant is off.
    if (miraMeetingId && miraTicked !== null)
      void rememberMira(miraMeetingId, miraTicked, miraRevision.current).catch(
        () => undefined
      );
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
  };

  const leave = () => {
    capture.release();
    onLeave();
  };

  return (
    <PrejoinStage
      avatarUrl={defaultAvatarUrl}
      capture={capture}
      consent={
        miraMeetingId ? (
          <LobbyMiraBox
            meetingId={miraMeetingId}
            onTickedChange={setMiraTicked}
            revisionRef={miraRevision}
            ticked={miraTicked}
          />
        ) : undefined
      }
      fields={
        guest ? (
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
        ) : (
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
