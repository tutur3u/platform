'use client';
import { useQuery } from '@tanstack/react-query';
import { readPrivateMiraPolicy } from '@tuturuuu/internal-api';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';
import { MEETING_APP } from '../../runtime';
import { MiraAvatar } from '../call/components/mira-profile';
import { PersonalChat } from '../call/components/personal-chat';
import type { MeetRoomController } from '../call/lib/room-controller';
import { useMeetUxV2 } from '../call/prejoin/prejoin-context';
import {
  clearLiveSession,
  type LiveSessionControls,
  publishLiveSession,
  readLiveVoice,
} from './live-session-store';
import { privateContinueAdmits, PrivateMiraNotice } from './private-notice';
import { useLiveAssistant } from './use-live-assistant';

/**
 * The Mira consent choice, plus the owner of this device's personal Live
 * session. It has no control of its own: the header's Mira control and the
 * Private Assistant tab open its dialog and drive the session through
 * `live-session-store`, so this panel keeps running while the dialog is shut.
 */
export function MeetLivePanel({
  room,
  accountId,
  meetingId,
  wsId,
  outputDeviceId,
  audioSuppressed = false,
  onLeave,
}: {
  room: MeetRoomController;
  accountId: string;
  meetingId: string;
  wsId?: string;
  outputDeviceId: string;
  canManage: boolean;
  audioSuppressed?: boolean;
  /** Ends the call for this device through the shell, so it shows the left screen. */
  onLeave: () => void;
}) {
  const t = useTranslations('meet.live');
  const call = useTranslations('meet.call');
  const v2 = useMeetUxV2() && MEETING_APP === 'meet';
  const streams: MediaStream[] = [];
  const live = useLiveAssistant(
    meetingId,
    outputDeviceId,
    {
      streams,
      suppressed: audioSuppressed,
      microphoneEnabled: room.media.audioEnabled,
    },
    room.getSelectedDevices().audio
  );
  const [open, setOpen] = useState(false);
  // The control that opened the dialog from the tab, so focus can return to it.
  const opener = useRef<HTMLElement | null>(null);
  const [choiceAccepted, setChoiceAccepted] = useState(false);
  const roomAdmitted =
    room.connectionStatus === 'open' && room.state.admission === 'admitted';
  // The dialog may be shut while the tab starts Mira, so the server's record
  // is observed here too. It shares the notice's query, never a second fetch.
  const policy = useQuery({
    queryKey: ['mira-private-choice', meetingId],
    queryFn: () => readPrivateMiraPolicy(meetingId),
    enabled: roomAdmitted && !v2,
    retry: false,
  });
  const confirmed =
    roomAdmitted &&
    policy.isSuccess &&
    privateContinueAdmits(policy.data, {
      connected: roomAdmitted,
      meetingId,
      accountId,
    });
  // The card follows the open, admitted room. A disconnect or a new meeting
  // or account clears it until the notice records a new Continue.
  useEffect(() => {
    if (!roomAdmitted) setChoiceAccepted(false);
  }, [roomAdmitted]);
  useEffect(() => {
    setChoiceAccepted(false);
  }, [meetingId, accountId]);
  // A latest read that is no longer a Continue drops this device's acceptance.
  useEffect(() => {
    if (policy.isSuccess && !confirmed) setChoiceAccepted(false);
  }, [confirmed, policy.isSuccess]);
  const active = !['idle', 'error', 'ended'].includes(live.status);
  // If the user unmutes the meeting, stop personal capture before any further audio is sent.
  useEffect(() => {
    if (active && live.mode === 'personal' && room.media.audioEnabled)
      live.send({ type: 'pause', paused: true });
  }, [active, live.mode, room.media.audioEnabled, live.send]);
  const accepted = choiceAccepted && confirmed;
  const canStart = v2 ? roomAdmitted : accepted;
  const latest = useRef({ live, room, canStart, audioSuppressed, accountId });
  latest.current = { live, room, canStart, audioSuppressed, accountId };
  const controls = useMemo<LiveSessionControls>(
    () => ({
      start: async () => {
        const { live, room, canStart, audioSuppressed, accountId } =
          latest.current;
        if (!canStart || audioSuppressed || !accountId) return;
        const restoreMicrophone = room.media.audioEnabled;
        const muteRevision = room.getSelectedDevices().microphoneRevision + 1;
        if (restoreMicrophone) await room.toggleMicrophone();
        const started = await live.start(
          'personal',
          [],
          room.getSelectedDevices().audio,
          undefined,
          readLiveVoice()
        );
        if (
          !started &&
          restoreMicrophone &&
          !room.media.audioEnabled &&
          room.getSelectedDevices().microphoneRevision === muteRevision
        )
          await room.toggleMicrophone();
      },
      send: (message) => latest.current.live.send(message),
      stop: () => latest.current.live.stop(),
      decide: (review, approved, text) =>
        latest.current.live.decide(review, approved, text),
      openConsent: () => {
        opener.current =
          document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;
        setOpen(true);
      },
    }),
    []
  );
  useEffect(() => {
    publishLiveSession({
      meetingId,
      accountId,
      status: live.status,
      mode: live.mode,
      transcript: live.transcript,
      reviews: live.reviews,
      error: live.error,
      accepted,
      audioSuppressed,
      meetingMicOn: room.media.audioEnabled,
      controls,
    });
  }, [
    meetingId,
    accountId,
    live.status,
    live.mode,
    live.transcript,
    live.reviews,
    live.error,
    accepted,
    audioSuppressed,
    room.media.audioEnabled,
    controls,
  ]);
  useEffect(() => () => clearLiveSession(controls), [controls]);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) opener.current = null;
        setOpen(next);
      }}
    >
      <DialogContent
        className="flex max-h-[85dvh] flex-col gap-4 overflow-hidden sm:max-w-md"
        onCloseAutoFocus={(event) => {
          const target = opener.current;
          opener.current = null;
          if (!target?.isConnected) return;
          event.preventDefault();
          target.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MiraAvatar />
            {v2 ? t('open_private') : t('title')}
          </DialogTitle>
          <DialogDescription className={v2 ? 'sr-only' : undefined}>
            {v2 ? call('personal_chat') : t('consent_hint')}
          </DialogDescription>
        </DialogHeader>
        {v2 ? (
          <div className="flex min-h-0 flex-col">
            {open && (
              <PersonalChat
                meetingId={meetingId}
                accountId={accountId}
                wsId={wsId}
                onShare={room.sendChat}
              />
            )}
          </div>
        ) : (
          <div className="min-h-0 overflow-y-auto">
            <PrivateMiraNotice
              wsId={wsId}
              meetingId={meetingId}
              accountId={accountId}
              connected={roomAdmitted}
              onStop={live.stop}
              onLeave={() => {
                setOpen(false);
                onLeave();
              }}
              onAccepted={setChoiceAccepted}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
