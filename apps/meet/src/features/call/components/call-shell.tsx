'use client';
import { useQuery } from '@tanstack/react-query';
import { Circle, WifiOff } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { toast } from '@tuturuuu/ui/sonner';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MeetingAiPanel } from '@/features/meeting-ai/meeting-ai-panel';
import { NotesSharingControl } from '@/features/meeting-ai/notes-sharing-control';
import { useMeetingAi } from '@/features/meeting-ai/use-meeting-ai';
import { useCallNotifications } from '../hooks/use-call-notifications';
import { useMeetRoom } from '../hooks/use-meet-room';
import { useRoomRecording } from '../hooks/use-room-recording';
import { useRoomUsage } from '../hooks/use-room-usage';
import {
  countUnreadChatMessages,
  isHandRaised,
  selectOthers,
  selectSelf,
} from '../lib/call-state';
import { getMediaErrorDiagnostic, getMediaErrorKey } from '../lib/media-error';
import { CallEnded } from './call-ended';
import { CallExtras } from './call-extras';
import { CallSettings } from './call-settings';
import { type CallLayout, CallStage } from './call-stage';
import { type CallPanel, ControlBar } from './control-bar';
import { CopyInvite } from './copy-invite';
import { LeaveDialog } from './leave-dialog';
import { Lobby } from './lobby';
import { MeetingTitle } from './meeting-title';
import { ReactionOverlay } from './reaction-overlay';
import { ScreenAudioStatus } from './screen-audio-status';
import { SidePanel } from './side-panel';

type Device = 'microphone' | 'camera' | 'screen';

export function ConnectedCallShell({
  defaultDisplayName,
  defaultAvatarUrl,
  canReadWorkspace = true,
  leaveHref,
  meetingId,
  meetingName,
  realtimeUrl,
  token,
  deviceId,
  wsId,
}: {
  defaultDisplayName: string;
  defaultAvatarUrl?: string;
  canReadWorkspace?: boolean;
  leaveHref: string;
  meetingId: string;
  meetingName: string;
  realtimeUrl: string;
  token: string;
  deviceId?: string;
  wsId: string;
}) {
  const t = useTranslations('meet.call');
  const aiT = useTranslations('meet.ai');
  const router = useRouter();
  const [joined, setJoined] = useState(false);
  const [left, setLeft] = useState(false);
  const leftRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const [leaveDialog, setLeaveDialog] = useState(false);
  const [ending, setEnding] = useState(false);
  const [showAi, setShowAi] = useState(false);
  const [outputDeviceId, setOutputDeviceId] = useState('');
  const [panel, setPanel] = useState<CallPanel>(null);
  const [layout, setLayout] = useState<CallLayout>('auto');
  const [focus, setFocus] = useState<string | null>(null);
  const focusFeed = useCallback((key: string | null) => {
    setFocus(key);
    setLayout(key ? 'spotlight' : 'auto');
  }, []);
  const [busyDevices, setBusyDevices] = useState<
    Partial<Record<Device, boolean>>
  >({});
  const pendingDevices = useRef(new Set<Device>());
  const room = useMeetRoom({ meetingId, realtimeUrl, token, wsId, deviceId });
  const { state } = room;
  const openNoticePanel = useCallback((next: 'chat' | 'participants') => {
    setPanel(next);
    setShowAi(false);
  }, []);
  const notifications = useCallNotifications(
    state,
    joined && !left,
    room.connectionStatus === 'open',
    openNoticePanel
  );
  const canManage = state.role === 'host';
  const canReadNotes = canManage || state.settings.shareNotes;
  const audioStreams = useMemo(
    () => [
      ...(room.localStream ? [room.localStream] : []),
      ...(room.screenStream ? [room.screenStream] : []),
      ...Object.values(room.remoteStreams),
    ],
    [room.localStream, room.screenStream, room.remoteStreams]
  );
  const ai = useMeetingAi(wsId, meetingId, audioStreams, !left, canReadNotes);
  const recording = useRoomRecording(room, meetingId, audioStreams);
  const telemetry = useQuery({
    queryKey: ['meet-media-health', meetingId],
    queryFn: room.getMediaDiagnostics,
    enabled: joined && !left,
    refetchInterval: 2000,
    retry: false,
    gcTime: 0,
  });
  const flushUsage = useRoomUsage(
    telemetry.data,
    joined && !left && state.admission === 'admitted',
    room.reportUsage
  );
  const [lastReadChatId, setLastReadChatId] = useState<string | null>(null);
  const newestChatId = state.chat.at(-1)?.id ?? null;
  const self = selectSelf(state);
  const others = useMemo(() => selectOthers(state), [state]);
  const participants = self ? [self, ...others] : others;
  const backHref = leaveHref.includes('/meetings/')
    ? `${leaveHref.split('/meetings/')[0]}/meetings`
    : '/';

  const runMediaAction = async (
    action: () => Promise<void>,
    device: Device
  ) => {
    if (pendingDevices.current.has(device) || leftRef.current) return;
    pendingDevices.current.add(device);
    setBusyDevices((current) => ({ ...current, [device]: true }));
    const id = `meet-media-${device}`;
    try {
      await action();
      toast.dismiss(id);
    } catch (error) {
      if (!leftRef.current) {
        const key = getMediaErrorKey(error, device);
        toast.error(t(key), {
          id,
          description:
            key === 'media_failed'
              ? t('media_error_code', { code: getMediaErrorDiagnostic(error) })
              : undefined,
        });
      }
    } finally {
      pendingDevices.current.delete(device);
      setBusyDevices((current) => ({ ...current, [device]: false }));
    }
  };
  const leaveNow = useCallback(() => {
    if (leftRef.current) return;
    leftRef.current = true;
    flushUsage();
    room.leave();
    setLeft(true);
    setLeaveDialog(false);
    setSaving(true);
    void Promise.allSettled([ai.finish(), recording.stop()]).then((results) => {
      if (results.some((result) => result.status === 'rejected'))
        toast.error(aiT('failed'));
      setSaving(false);
    });
  }, [room.leave, ai.finish, recording.stop, aiT, flushUsage]);
  useEffect(() => {
    if (panel === 'chat') setLastReadChatId(newestChatId);
  }, [panel, newestChatId]);
  useEffect(() => {
    if (state.ended || state.admission === 'denied') leaveNow();
  }, [state.ended, state.admission, leaveNow]);

  if (left || state.ended)
    return (
      <CallEnded
        ended={state.ended}
        canManage={canManage}
        canReadNotes={
          state.ended ? !!state.settings.shareNotesAfterMeeting : canReadNotes
        }
        shareNotesAfterMeeting={state.settings.shareNotesAfterMeeting}
        wsId={wsId}
        meetingId={meetingId}
        meetingName={state.title ?? meetingName}
        backHref={backHref}
        saving={saving}
      />
    );
  if (!joined || state.admission === 'waiting')
    return (
      <Lobby
        avatarUrl={defaultAvatarUrl}
        defaultDisplayName={defaultDisplayName}
        connectionError={
          room.connectionStatus === 'closed' ||
          room.connectionStatus === 'error'
            ? t('signaling_unreachable')
            : null
        }
        isJoining={state.admission === 'connecting'}
        meetingName={meetingName}
        waiting={state.admission === 'waiting'}
        transcriptionNotice={
          !canReadNotes && !canReadWorkspace
            ? t('guest_transcription_notice')
            : ai.data?.sessions.some((session) => !session.ended_at)
              ? aiT('join_notice')
              : undefined
        }
        onLeave={() => {
          room.leave();
          router.push(backHref);
        }}
        onJoin={({ audioEnabled, videoEnabled, previewStream }) => {
          setJoined(true);
          void room
            .adoptPreview(previewStream)
            .then(() =>
              Promise.all([
                ...(audioEnabled
                  ? [runMediaAction(room.toggleMicrophone, 'microphone')]
                  : []),
                ...(videoEnabled
                  ? [runMediaAction(room.toggleCamera, 'camera')]
                  : []),
              ])
            )
            .catch(() => toast.error(t('media_failed')));
        }}
      />
    );

  return (
    <div className="flex h-dvh flex-col bg-background">
      <header className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
        <MeetingTitle
          meetingId={meetingId}
          title={room.state.title ?? meetingName}
          canManage={canManage}
          onSaved={room.renameMeeting}
        />
        {canReadNotes && (
          <Button
            variant="outline"
            size="sm"
            className="h-8 max-w-full rounded-full text-xs"
            aria-expanded={showAi}
            onClick={() => {
              setShowAi(!showAi);
              setPanel(null);
            }}
          >
            {aiT('title')}
          </Button>
        )}
        <CallSettings
          meetingId={meetingId}
          room={room}
          telemetry={telemetry.data}
          ai={ai}
          canManage={canManage}
          sound={notifications.sound}
          onSound={notifications.toggleSound}
          outputDeviceId={outputDeviceId}
          onOutput={setOutputDeviceId}
        />
        <CopyInvite
          meetingId={meetingId}
          meetingName={room.state.title ?? meetingName}
        />
        {state.recording.state === 'recording' && (
          <span className="flex items-center gap-1.5 rounded-full bg-dynamic-red/10 px-2 py-1 text-dynamic-red text-xs">
            <Circle className="size-2 fill-current motion-safe:animate-pulse" />
            {t('recording')}
          </span>
        )}
        {room.connectionStatus !== 'open' && (
          <span className="flex items-center gap-1.5 text-muted-foreground text-xs">
            <WifiOff className="size-3.5" />
            {t('reconnecting')}
          </span>
        )}
      </header>
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <main className="relative min-h-0 flex-1 p-2 sm:p-3">
          {room.screenStream && (
            <div className="absolute top-3 left-3 z-20">
              <ScreenAudioStatus stream={room.screenStream} />
            </div>
          )}
          <CallStage
            outputDeviceId={outputDeviceId}
            room={room}
            layout={layout}
            focus={focus}
            onFocus={focusFeed}
          />
          <ReactionOverlay state={state} />
        </main>
        {showAi && canReadNotes && (
          <aside className="max-h-[50dvh] w-full shrink-0 overflow-y-auto p-3 md:max-h-none md:w-96">
            <MeetingAiPanel ai={ai} inCall />
            {canManage && (
              <div className="mt-3">
                <NotesSharingControl
                  wsId={wsId}
                  meetingId={meetingId}
                  initialEnabled={state.settings.shareNotesAfterMeeting}
                />
              </div>
            )}
          </aside>
        )}
        {panel && (
          <SidePanel
            meetingId={meetingId}
            canManage={canManage}
            chat={state.chat}
            onClose={() => setPanel(null)}
            onDecideAdmission={room.decideAdmission}
            onMute={(userId) => room.muteParticipant(userId, ['audio'])}
            onRemove={room.removeParticipant}
            onSendChat={room.sendChat}
            panel={panel}
            participants={participants}
            raisedHandUserIds={state.stage.raisedHandUserIds}
            selfUserId={state.selfUserId}
            waiting={state.waiting}
            approved={state.approved}
            onForget={room.forgetParticipant}
            shareNotes={state.settings.shareNotes}
            onShareNotes={room.shareNotes}
          />
        )}
      </div>
      <ControlBar
        activePanel={panel}
        cameraOn={room.media.videoEnabled}
        micOn={room.media.audioEnabled}
        screenOn={room.media.screenEnabled}
        handRaised={
          state.selfUserId ? isHandRaised(state, state.selfUserId) : false
        }
        busyDevices={busyDevices}
        participantCount={participants.length}
        recordingBusy={recording.isBusy}
        recordingOn={state.recording.state === 'recording'}
        unreadChat={
          panel === 'chat'
            ? 0
            : countUnreadChatMessages(state.chat, lastReadChatId)
        }
        waitingCount={state.waiting.length}
        onLeave={() => (canManage ? setLeaveDialog(true) : leaveNow())}
        onToggleMic={() =>
          void runMediaAction(room.toggleMicrophone, 'microphone')
        }
        onToggleCamera={() => void runMediaAction(room.toggleCamera, 'camera')}
        onToggleScreen={() =>
          void runMediaAction(room.toggleScreenShare, 'screen')
        }
        onToggleHand={() =>
          room.raiseHand(
            !(state.selfUserId && isHandRaised(state, state.selfUserId))
          )
        }
        onTogglePanel={(next) => {
          setPanel(next);
          setShowAi(false);
        }}
        onToggleRecording={
          canManage || state.settings.allowParticipantRecording
            ? () =>
                void recording
                  .toggle()
                  .catch(() => toast.error(t('record_start_failed')))
            : undefined
        }
        extraControls={
          <CallExtras
            layout={layout}
            setLayout={(next) => {
              setLayout(next);
              setFocus(null);
            }}
            look={room.cameraLook}
            setLook={(look) => {
              void room.setCameraLook(look).catch((error) => {
                if (
                  !(
                    error instanceof DOMException && error.name === 'AbortError'
                  )
                )
                  toast.error(t('effects_failed'));
              });
            }}
            react={room.react}
          />
        }
      />
      <LeaveDialog
        open={leaveDialog}
        onOpenChange={setLeaveDialog}
        busy={ending}
        onLeave={leaveNow}
        onEnd={() => {
          setEnding(true);
          void room.endMeeting().catch(() => {
            setEnding(false);
            toast.error(t('end_failed'));
          });
        }}
      />
    </div>
  );
}

export { CallShell } from './device-session-gate';
