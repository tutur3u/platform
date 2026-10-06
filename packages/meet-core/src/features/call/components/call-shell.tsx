'use client';

import { useQuery } from '@tanstack/react-query';
import {
  CalendarDays,
  Circle,
  Code2,
  FileText,
  Leaf,
  Sparkles,
  Users,
  WifiOff,
} from '@tuturuuu/icons';
import { MeetLivePanel } from '@tuturuuu/meet-core/features/live-assistant/live-panel';
import { RoomAssistantAudio } from '@tuturuuu/meet-core/features/live-assistant/room-audio';
import { meetingAudioSources } from '@tuturuuu/meet-core/features/meeting-ai/audio-sources';
import { MeetingAiPanel } from '@tuturuuu/meet-core/features/meeting-ai/meeting-ai-panel';
import { NotesSharingControl } from '@tuturuuu/meet-core/features/meeting-ai/notes-sharing-control';
import { useMeetingAi } from '@tuturuuu/meet-core/features/meeting-ai/use-meeting-ai';
import { MEETING_APP } from '@tuturuuu/meet-core/runtime';
import { Button } from '@tuturuuu/ui/button';
import { toast } from '@tuturuuu/ui/sonner';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { ComponentProps } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useCallNotifications } from '../hooks/use-call-notifications';
import { useMeetRoom } from '../hooks/use-meet-room';
import { useProgrammingOpener } from '../hooks/use-programming-opener';
import { useRoomRecording } from '../hooks/use-room-recording';
import { useRoomUsage } from '../hooks/use-room-usage';
import { useSharedRoomAudio } from '../hooks/use-shared-room-audio';
import {
  countUnreadChatMessages,
  isHandRaised,
  selectOthers,
  selectSelf,
} from '../lib/call-state';
import { getMediaErrorDiagnostic, getMediaErrorKey } from '../lib/media-error';
import { encodeRoomCode } from '../lib/room-code';
import { CallEnded } from './call-ended';
import { CallExtras } from './call-extras';
import { CallResourceNotice, resourceErrorKey } from './call-resource-notice';
import { CallSettings } from './call-settings';
import { type CallLayout, CallStage } from './call-stage';
import { CollaborationStageLayout } from './collaboration-stage-layout';
import { type CallPanel, ControlBar, ControlButton } from './control-bar';
import { CopyInvite } from './copy-invite';
import { DocumentPanel } from './document-panel';
import { LeaveDialog } from './leave-dialog';
import { Lobby } from './lobby';
import { MeetingActionHint } from './meeting-action-hint';
import { MeetingTitle } from './meeting-title';
import { PersonalToolsPanel } from './personal-tools-panel';
import {
  PlaybackVolumeControl,
  PlaybackVolumeProvider,
} from './playback-volume';
import { ProgrammingPanel } from './programming-panel';
import { ReactionOverlay } from './reaction-overlay';
import { ResizableCallPanel } from './resizable-call-panel';
import { RoomCountdown } from './room-countdown';
import { ScreenAudioStatus } from './screen-audio-status';
import { SharedAudioControl } from './shared-audio-control';
import { SidePanel } from './side-panel';

type Device = 'microphone' | 'camera' | 'screen';

/** Compose the active meeting, including protected audio and compact room controls. */
function CallShellContent({
  accountId,
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
  accountId: string;
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
  const programmingT = useTranslations('programmingPlayground');
  const [showProgramming, setShowProgramming] = useState(false);
  const programming = useProgrammingOpener(
    meetingId,
    programmingT('playground'),
    accountId
  );
  const [showDocument, setShowDocument] = useState(false);
  const collaborationT = useTranslations('meet.collaboration');
  const [showAi, setShowAi] = useState(false);
  const [showPersonalTools, setShowPersonalTools] = useState(false);
  const privateT = useTranslations('meet.call.private_tools');
  const [outputDeviceId, setOutputDeviceId] = useState('');
  const [mentionRequest, setMentionRequest] = useState(0);
  const onMentionHandled = useCallback(() => setMentionRequest(0), []);
  const askMira = () => {
    setMentionRequest((value) => value + 1);
    setPanel('chat');
    setShowAi(false);
  };
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
  const sharedAudio = useSharedRoomAudio(room, joined && !left);
  const openNoticePanel = useCallback((next: 'chat' | 'participants') => {
    setPanel(next);
    setShowPersonalTools(false);
    setShowAi(false);
  }, []);
  const notifications = useCallNotifications(
    state,
    joined && !left,
    room.connectionStatus === 'open',
    openNoticePanel,
    panel,
    sharedAudio.shared
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
  const transcriptionSources = useMemo(
    () =>
      meetingAudioSources({
        localStream: room.localStream,
        screenStream: room.screenStream,
        remoteMedia: room.remoteMedia,
        participants: state.participants,
        selfUserId: state.selfUserId,
      }),
    [
      room.localStream,
      room.screenStream,
      room.remoteMedia,
      state.participants,
      state.selfUserId,
    ]
  );
  const ai = useMeetingAi(
    wsId,
    meetingId,
    transcriptionSources,
    !left && Object.keys(state.participants).length > 1,
    canReadNotes
  );
  const recording = useRoomRecording(room, meetingId, audioStreams);
  const telemetry = useQuery({
    queryKey: ['meet-media-health', meetingId],
    queryFn: room.getMediaDiagnostics,
    enabled: joined && !left,
    refetchInterval: Object.keys(state.participants).length > 1 ? 2000 : 15000,
    retry: false,
    gcTime: 0,
  });
  const flushUsage = useRoomUsage(
    telemetry.data,
    joined &&
      !left &&
      state.admission === 'admitted' &&
      room.connectionStatus === 'open',
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
          action:
            device === 'screen' &&
            ['screen_browser_unsupported', 'screen_permission_denied'].includes(
              key
            ) &&
            MEETING_APP === 'meet'
              ? {
                  label: t('share_from_mobile_app'),
                  onClick: () => {
                    window.location.assign(
                      `https://tuturuuu.com/personal/meet?room=${encodeRoomCode(meetingId)}`
                    );
                  },
                }
              : undefined,
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
        accountId={accountId}
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
            : resourceErrorKey(state.error)
              ? t(resourceErrorKey(state.error)!)
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
          const enableMicrophone = sharedAudio.prepareJoin(audioEnabled);
          setJoined(true);
          void room
            .adoptPreview(previewStream)
            .then(() =>
              Promise.all([
                ...(enableMicrophone
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
        {participants.length === 1 && !state.liveAssistant && (
          <span
            role="status"
            className="inline-flex items-center gap-1.5 rounded-full border bg-muted/40 px-2.5 py-1 text-muted-foreground text-xs"
            title={t('solo_hint')}
          >
            <Leaf className="size-3.5" />
            {t('solo_mode')}
          </span>
        )}
        {canReadNotes && (
          <MeetingActionHint label={aiT('title')}>
            <Button
              variant="outline"
              size="sm"
              className="h-8 max-w-full rounded-full text-xs"
              aria-expanded={showAi}
              onClick={() => {
                setShowAi(!showAi);
                setShowPersonalTools(false);
                setPanel(null);
              }}
            >
              <Sparkles className="size-3.5" />
              {aiT('title')}
            </Button>
          </MeetingActionHint>
        )}
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
        <RoomAssistantAudio
          room={room}
          audioSuppressed={sharedAudio.shared}
          canManage={canManage}
          meetingId={meetingId}
          outputDeviceId={outputDeviceId}
        />
        <MeetLivePanel
          key="live-assistant"
          onOpenChat={askMira}
          room={room}
          meetingId={meetingId}
          outputDeviceId={outputDeviceId}
          canManage={canManage}
          audioSuppressed={sharedAudio.microphonePaused}
        />
        <PlaybackVolumeControl
          participants={participants}
          selfUserId={state.selfUserId}
        />
        <SharedAudioControl
          audio={sharedAudio}
          busy={!!busyDevices.microphone}
          onShare={() => void runMediaAction(sharedAudio.share, 'microphone')}
          onUseMicrophone={() =>
            void runMediaAction(sharedAudio.useOwnMicrophone, 'microphone')
          }
        />
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
        <RoomCountdown expiresAt={state.roomExpiresAt} />
      </header>
      {canManage && state.waiting.length > 0 && (
        <div
          role="status"
          className="flex items-center justify-between gap-3 border-b bg-muted/40 px-3 py-2"
        >
          <span className="text-sm">
            {t('waiting_room', { count: state.waiting.length })}
          </span>
          <MeetingActionHint
            label={t('participants', { count: participants.length })}
          >
            <Button
              size="sm"
              variant="outline"
              className="h-8 rounded-full"
              onClick={() => {
                setPanel('participants');
                setShowAi(false);
              }}
            >
              <Users className="size-3.5" />
              {t('participants', { count: participants.length })}
            </Button>
          </MeetingActionHint>
        </div>
      )}
      <CallResourceNotice error={state.error} />
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <main
          className={
            showDocument
              ? 'relative min-h-0 flex-1'
              : 'relative min-h-0 flex-1 p-2 sm:p-3'
          }
        >
          {room.screenStream && (
            <div className="absolute top-3 left-3 z-20">
              <ScreenAudioStatus stream={room.screenStream} />
            </div>
          )}
          <CollaborationStageLayout
            layout={layout}
            content={
              showProgramming ? (
                <ProgrammingPanel
                  meetingId={meetingId}
                  wsId={wsId}
                  accountId={accountId}
                  preparing={programming.isPending}
                  canManage={canManage}
                  selection={state.settings.programming ?? null}
                />
              ) : showDocument ? (
                <DocumentPanel meetingId={meetingId} accountId={accountId} />
              ) : null
            }
            stage={
              <CallStage
                onChat={askMira}
                audioSuppressed={sharedAudio.shared}
                outputDeviceId={outputDeviceId}
                room={room}
                layout={layout}
                compact={showProgramming || showDocument}
                focus={focus}
                onFocus={focusFeed}
              />
            }
          />
          <ReactionOverlay state={state} />
        </main>
        {showPersonalTools && MEETING_APP === 'meet' && (
          <PersonalToolsPanel
            accountId={accountId}
            onClose={() => setShowPersonalTools(false)}
          />
        )}
        {showAi && canReadNotes && (
          <ResizableCallPanel label={aiT('title')}>
            <div className="min-h-0 overflow-y-auto p-3">
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
            </div>
          </ResizableCallPanel>
        )}
        {panel && (
          <SidePanel
            mentionRequest={mentionRequest}
            onMentionHandled={onMentionHandled}
            meetingId={meetingId}
            miraActive={!!state.liveAssistant}
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
        micOn={!sharedAudio.microphonePaused && room.media.audioEnabled}
        screenOn={room.media.screenEnabled}
        handRaised={
          state.selfUserId ? isHandRaised(state, state.selfUserId) : false
        }
        busyDevices={busyDevices}
        participantCount={participants.length + (state.liveAssistant ? 1 : 0)}
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
          sharedAudio.microphonePaused
            ? void runMediaAction(sharedAudio.useOwnMicrophone, 'microphone')
            : void runMediaAction(room.toggleMicrophone, 'microphone')
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
          setShowPersonalTools(false);
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
          <>
            {MEETING_APP === 'meet' && (
              <ControlButton
                active={showPersonalTools}
                icon={CalendarDays}
                label={privateT('title')}
                onClick={() => {
                  setShowPersonalTools((value) => !value);
                  setPanel(null);
                  setShowAi(false);
                }}
              />
            )}
            {MEETING_APP === 'meet' && (
              <ControlButton
                active={showProgramming}
                icon={Code2}
                label={programmingT('coding')}
                onClick={() => {
                  setShowDocument(false);
                  setShowProgramming((value) => !value);
                  if (!showProgramming && canManage)
                    void programming
                      .prepare()
                      .catch(() => toast.error(programmingT('accessError')));
                }}
              />
            )}
            {MEETING_APP === 'meet' && (
              <ControlButton
                active={showDocument}
                icon={FileText}
                label={collaborationT('document')}
                onClick={() => {
                  setShowProgramming(false);
                  setShowDocument((value) => !value);
                }}
              />
            )}
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
                      error instanceof DOMException &&
                      error.name === 'AbortError'
                    )
                  )
                    toast.error(t('effects_failed'));
                });
              }}
              react={room.react}
            />
          </>
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

export function ConnectedCallShell(
  props: ComponentProps<typeof CallShellContent>
) {
  return (
    <PlaybackVolumeProvider>
      <CallShellContent {...props} />
    </PlaybackVolumeProvider>
  );
}
