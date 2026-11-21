'use client';
import { useQuery } from '@tanstack/react-query';
import { Users } from '@tuturuuu/icons';
import { MeetLivePanel } from '@tuturuuu/meet-core/features/live-assistant/live-panel';
import { RoomAssistantAudio } from '@tuturuuu/meet-core/features/live-assistant/room-audio';
import { meetingAudioSources } from '@tuturuuu/meet-core/features/meeting-ai/audio-sources';
import { useMeetingAi } from '@tuturuuu/meet-core/features/meeting-ai/use-meeting-ai';
import { MEETING_APP } from '@tuturuuu/meet-core/runtime';
import { Button } from '@tuturuuu/ui/button';
import { toast } from '@tuturuuu/ui/sonner';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { ComponentProps } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { canTranscribeMeet } from '../../meeting-ai/eligibility';
import { showMeetingAiFailure } from '../../meeting-ai/failure-toast';
import { useCallNotifications } from '../hooks/use-call-notifications';
import { useMeetRoom } from '../hooks/use-meet-room';
import { useProgrammingOpener } from '../hooks/use-programming-opener';
import { useRoomRecording } from '../hooks/use-room-recording';
import { useRoomUsage } from '../hooks/use-room-usage';
import { useSharedRoomAudio } from '../hooks/use-shared-room-audio';
import {
  countUnreadChatMessages,
  isHandRaised,
  selectCallLifecycle,
  selectOthers,
  selectSelf,
} from '../lib/call-state';
import { getMediaErrorDiagnostic, getMediaErrorKey } from '../lib/media-error';
import { encodeRoomCode } from '../lib/room-code';
import { type ActivityDrawer, useCallActivities } from './call-activities';
import { CallEnded } from './call-ended';
import { CallRoomTools, useRoomTools } from './call-room-tools';
import { CallExtras } from './call-extras';
import { ConnectedLobby } from './call-lobby';
import { CallResourceNotice } from './call-resource-notice';
import { CallSettings } from './call-settings';
import { type CallLayout, CallStage } from './call-stage';
import { CallTopBarConnection, CallTopBarMore } from './call-top-bar';
import { CollaborationStageLayout } from './collaboration-stage-layout';
import { type CallPanel, ControlBar } from './control-bar';
import {
  AccountGatedNotesDrawer,
  AccountGatedPersonalDrawer,
  accountGatedCollaboration,
} from './call-account-gates';
import { JoinOutcome } from './join-outcome';
import { LeaveDialog } from './leave-dialog';
import { MeetingActionHint } from './meeting-action-hint';
import { MeetingStatus, MeetingTitle } from './meeting-title';
import {
  PlaybackVolumeControl,
  PlaybackVolumeProvider,
} from './playback-volume';
import { ReactionOverlay } from './reaction-overlay';
import { CallPanelOwnerContext } from './resizable-call-panel';
import { CallClock } from './call-clock';
import { ScreenAudioStatus } from './screen-audio-status';
import { SharedAudioControl } from './shared-audio-control';
import { SidePanel } from './side-panel';
import { type ToolDrawer, useMeetTools } from '../tools/use-meet-tools';
type Device = 'microphone' | 'camera' | 'screen';
function CallShellContent({
  accountId,
  defaultDisplayName,
  defaultAvatarUrl,
  canReadWorkspace = true,
  classroomToolsEnabled,
  requiresAccount = false,
  formsEnabled = false,
  formsTurnstileSiteKey,
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
  classroomToolsEnabled?: boolean;
  requiresAccount?: boolean;
  formsEnabled?: boolean;
  formsTurnstileSiteKey?: string;
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
  const collaborationT = useTranslations('meet.collaboration');
  const [programmingOpen, setShowProgramming] = useState(false);
  const programming = useProgrammingOpener(
    meetingId,
    programmingT('playground'),
    accountId
  );
  const [documentOpen, setShowDocument] = useState(false);
  const [drawer, setDrawer] = useState<
    CallPanel | 'notes' | 'personal' | 'feedback' | ActivityDrawer | ToolDrawer
  >(null);
  const chatOpen = drawer === 'chat' || drawer === 'feedback';
  const panel = chatOpen ? 'chat' : drawer === 'participants' ? drawer : null;
  const privateT = useTranslations('meet.call.private_tools');
  const [outputDeviceId, setOutputDeviceId] = useState('');
  const [mentionRequest, setMentionRequest] = useState(0);
  const onMentionHandled = useCallback(() => setMentionRequest(0), []);
  const askMira = () => {
    setMentionRequest((value) => value + 1);
    setDrawer('chat');
  };
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
  const retryConnection = () => {
    room.leave();
    window.location.reload();
  };
  const inCall = joined && !left;
  const sharedAudio = useSharedRoomAudio(room, inCall);
  const notifications = useCallNotifications(
    state,
    inCall,
    room.connectionStatus === 'open',
    setDrawer,
    panel,
    sharedAudio.shared
  );
  const canManage = state.role === 'host';
  const toolMode = state.settings.advancedTools;
  const roomTools = useRoomTools(
    toolMode,
    state.canManageParticipants ?? canManage
  );
  const showProgramming = roomTools.canUse && programmingOpen;
  const showDocument = roomTools.canUse && documentOpen;
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
    canTranscribeMeet(left, Object.keys(state.participants).length),
    canReadNotes,
    accountId,
    { title: state.title ?? meetingName }
  );
  const recording = useRoomRecording(room, meetingId, audioStreams);
  const telemetry = useQuery({
    queryKey: ['meet-media-health', meetingId],
    queryFn: room.getMediaDiagnostics,
    enabled: joined && !left,
    refetchInterval: Object.keys(state.participants).length > 1 ? 5000 : 15000,
    retry: false,
    gcTime: 0,
  });
  const flushUsage = useRoomUsage(
    telemetry.data,
    joined &&
      !left &&
      state.admission === 'admitted' &&
      room.connectionStatus === 'open',
    room.reportUsage,
    room.reportMediaQuality
  );
  const [lastReadChatId, setLastReadChatId] = useState<string | null>(null);
  const newestChatId = state.chat.at(-1)?.id ?? null;
  const self = selectSelf(state);
  const selfHandRaised = state.selfUserId
    ? isHandRaised(state, state.selfUserId)
    : false;
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
    void Promise.allSettled([ai.finish(), recording.stop()]).then(
      ([aiResult, recordingResult]) => {
        if (aiResult.status === 'rejected')
          showMeetingAiFailure(aiT, aiResult.reason);
        else if (recordingResult.status === 'rejected')
          toast.error(aiT('failed'));
        setSaving(false);
      }
    );
  }, [room, ai, recording, aiT, flushUsage]);
  if (panel === 'chat' && lastReadChatId !== newestChatId)
    setLastReadChatId(newestChatId);
  useEffect(() => {
    if (state.ended || state.admission === 'denied') leaveNow();
  }, [state.ended, state.admission, leaveNow]);
  const lifecycle = selectCallLifecycle(state, joined);
  const liveTools = MEETING_APP === 'meet' && lifecycle === 'live' && inCall;
  const tools = useMeetTools<ActivityDrawer>({
    drawer,
    onDrawer: setDrawer,
    meetingId,
    accountId,
    requiresAccount,
    canManage,
    enabled: liveTools,
    available: roomTools.canUse,
  });
  const activities = useCallActivities({
    requiresAccount,
    meetingId,
    accountId,
    enabled: liveTools,
    showTools: false,
    formsEnabled,
    formsTurnstileSiteKey,
    formsAccess: { canManage, canReadWorkspace },
    classroomToolsEnabled,
    drawer,
    onDrawer: tools.route,
  });
  if (lifecycle === 'error')
    return (
      <JoinOutcome
        reason={state.admissionReason ?? 'denied'}
        meetingName={meetingName}
        leaveHref={backHref}
      />
    );
  if (left || lifecycle === 'ended')
    return (
      <CallEnded
        accountId={accountId}
        lifecycle={lifecycle}
        canManage={canManage}
        canReadNotes={
          state.ended ? !!state.settings.shareNotesAfterMeeting : canReadNotes
        }
        canStartMeeting={canReadWorkspace && MEETING_APP !== 'parley'}
        shareNotesAfterMeeting={state.settings.shareNotesAfterMeeting}
        wsId={wsId}
        meetingId={meetingId}
        meetingName={state.title ?? meetingName}
        backHref={backHref}
        saving={saving}
      />
    );
  if (lifecycle === 'preparing' || lifecycle === 'joining')
    return (
      <ConnectedLobby
        canReadWorkspace={canReadWorkspace}
        defaultAvatarUrl={defaultAvatarUrl}
        defaultDisplayName={defaultDisplayName}
        joined={joined}
        meetingName={meetingName}
        onJoined={() => setJoined(true)}
        onLeave={() => {
          room.leave();
          router.push(backHref);
        }}
        onOutputDeviceChange={setOutputDeviceId}
        onRetry={retryConnection}
        outputDeviceId={outputDeviceId}
        participants={others}
        prepareJoin={sharedAudio.prepareJoin}
        room={room}
        runMediaAction={runMediaAction}
        transcriptionNotice={
          !canReadNotes && !canReadWorkspace
            ? t('guest_transcription_notice')
            : ai.data?.sessions.some(
                  (session: { ended_at: string | null }) => !session.ended_at
                )
              ? aiT('join_notice')
              : undefined
        }
      />
    );
  return (
    <div className="flex h-dvh flex-col bg-background">
      <header className="flex flex-wrap items-center gap-3 border-b px-4 py-2">
        <MeetingTitle
          meetingId={meetingId}
          title={room.state.title ?? meetingName}
          canManage={canManage}
          onSaved={room.renameMeeting}
        />
        <MeetingStatus
          solo={participants.length === 1 && !state.liveAssistant}
          recording={state.recording.state === 'recording'}
        />
        <CallTopBarConnection
          status={room.connectionStatus}
          onRetry={retryConnection}
        />
        <div className="ml-auto flex items-center gap-2">
          <RoomAssistantAudio
            room={room}
            audioSuppressed={sharedAudio.shared}
            canManage={canManage}
            meetingId={meetingId}
            outputDeviceId={outputDeviceId}
          />
          {state.settings.transport !== 'presence' && (
            <>
              <MeetLivePanel
                wsId={wsId}
                accountId={accountId}
                key="live-assistant"
                onOpenChat={askMira}
                onLeave={leaveNow}
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
                onShare={() =>
                  void runMediaAction(sharedAudio.share, 'microphone')
                }
                onUseMicrophone={() =>
                  void runMediaAction(
                    sharedAudio.useOwnMicrophone,
                    'microphone'
                  )
                }
              />
            </>
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
          <CallClock meetingId={meetingId} state={state} />
          <CallTopBarMore
            mailContext={{
              workspaceId: wsId,
              actorId: accountId,
              canReadWorkspace,
              canManage,
            }}
            meetingId={meetingId}
            meetingName={room.state.title ?? meetingName}
            canReadNotes={canReadNotes}
            transcriptOpen={drawer === 'notes'}
            onToggleTranscript={() =>
              setDrawer(drawer === 'notes' ? null : 'notes')
            }
          />
        </div>
      </header>
      {canManage && state.waiting.length > 0 && (
        <output className="flex items-center justify-between gap-3 border-b bg-muted/40 px-3 py-2">
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
              onClick={() => setDrawer('participants')}
            >
              <Users className="size-3.5" />
              {t('participants', { count: participants.length })}
            </Button>
          </MeetingActionHint>
        </output>
      )}
      <CallResourceNotice error={state.error} />
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <main
          className={`relative min-h-0 min-w-0 flex-1 ${showDocument ? '' : 'p-2 sm:p-3'}`}
        >
          {room.screenStream && (
            <div className="absolute top-3 left-3 z-20">
              <ScreenAudioStatus stream={room.screenStream} />
            </div>
          )}
          <CollaborationStageLayout
            layout={layout}
            content={accountGatedCollaboration(
              requiresAccount,
              showProgramming,
              showDocument,
              {
                meetingId,
                wsId,
                accountId,
                preparing: programming.isPending,
                canManage,
                selection: state.settings.programming ?? null,
              },
              {
                meetingId,
                accountId,
                admitted: state.admission === 'admitted',
                onRequestAccess: () =>
                  room.sendChat(collaborationT('document_access_message')),
              }
            )}
            stage={
              <CallStage
                selfInGrid
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
        {activities.panel}
        {tools.panel}
        <AccountGatedPersonalDrawer
          open={roomTools.canUse && drawer === 'personal'}
          requiresAccount={requiresAccount}
          accountId={accountId}
          label={privateT('title')}
          onClose={() => setDrawer(null)}
        />
        <AccountGatedNotesDrawer
          open={drawer === 'notes'}
          requiresAccount={requiresAccount}
          label={aiT('title')}
          canReadNotes={canReadNotes}
          canManage={canManage}
          shareNotesAfterMeeting={state.settings.shareNotesAfterMeeting}
          wsId={wsId}
          meetingId={meetingId}
          ai={ai}
        />
        {panel && (
          <SidePanel
            wsId={wsId}
            accountId={accountId}
            roomFeedback={drawer === 'feedback'}
            mentionRequest={mentionRequest}
            onMentionHandled={onMentionHandled}
            meetingId={meetingId}
            miraActive={!!state.liveAssistant}
            canManage={canManage}
            chat={state.chat}
            onClose={() => setDrawer(null)}
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
        presenceOnly={state.settings.transport === 'presence'}
        onPresenceChange={
          canManage
            ? (enabled) =>
                room.updateSettings({
                  transport: enabled ? 'presence' : 'media',
                })
            : undefined
        }
        activePanel={panel}
        tools={tools.hub}
        toolsMenu={tools.menu}
        liveActivity={activities.liveControl}
        cameraOn={room.media.videoEnabled}
        micOn={!sharedAudio.microphonePaused && room.media.audioEnabled}
        screenOn={room.media.screenEnabled}
        handRaised={selfHandRaised}
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
        viewer={state.role === 'viewer'}
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
        onToggleHand={() => room.raiseHand(!selfHandRaised)}
        onTogglePanel={setDrawer}
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
            <CallRoomTools
              mode={toolMode}
              policy={roomTools}
              onMode={(advancedTools) => room.updateSettings({ advancedTools })}
              activities={activities.controls}
              actions={{
                personal: {
                  active: drawer === 'personal',
                  toggle: () =>
                    setDrawer(drawer === 'personal' ? null : 'personal'),
                },
                programming: {
                  active: showProgramming,
                  toggle: () => {
                    setShowDocument(false);
                    setShowProgramming(!showProgramming);
                    if (!showProgramming && canManage)
                      void programming
                        .prepare()
                        .catch(() => toast.error(programmingT('accessError')));
                  },
                },
                document: {
                  active: showDocument,
                  toggle: () => {
                    setShowProgramming(false);
                    setShowDocument(!showDocument);
                  },
                },
                feedback: () => setDrawer('feedback'),
              }}
            />
            <CallExtras
              layout={layout}
              setLayout={(next) => {
                setLayout(next);
                setFocus(null);
              }}
              look={room.cameraLook}
              setLook={room.setCameraLook}
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
      <CallPanelOwnerContext.Provider value={props.accountId}>
        <CallShellContent {...props} />
      </CallPanelOwnerContext.Provider>
    </PlaybackVolumeProvider>
  );
}
