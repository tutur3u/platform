'use client';
import { useQuery } from '@tanstack/react-query';
import { MeetLivePanel } from '@tuturuuu/meet-core/features/live-assistant/live-panel';
import { RoomAssistantAudio } from '@tuturuuu/meet-core/features/live-assistant/room-audio';
import { meetingAudioSources } from '@tuturuuu/meet-core/features/meeting-ai/audio-sources';
import { useMeetingAi } from '@tuturuuu/meet-core/features/meeting-ai/use-meeting-ai';
import { MEETING_APP } from '@tuturuuu/meet-core/runtime';
import { toast } from '@tuturuuu/ui/sonner';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { ComponentProps } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { canTranscribeMeet } from '../../meeting-ai/eligibility';
import { showMeetingAiFailure } from '../../meeting-ai/failure-toast';
import { useCallNotifications } from '../hooks/use-call-notifications';
import { useCallMediaActions } from '../hooks/call-media-actions';
import { useMeetRoom } from '../hooks/use-meet-room';
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
import { type ActivityDrawer, useCallActivities } from './call-activities';
import { CallEnded } from './call-ended';
import { useRoomTools } from './call-room-tools';
import { CallControlDock } from './call-control-dock';
import { CallHeader } from './call-header';
import { CallPresenceRoster } from './call-presence-roster';
import { ConnectedLobby } from './call-lobby';
import { CallResourceNotice } from './call-resource-notice';
import { CallSettings } from './call-settings';
import { CallSettingsLinkProvider } from './call-settings-link';
import { type CallLayout, CallStage } from './call-stage';
import { CallTopBarMore } from './call-top-bar';
import { CollaborationStageLayout } from './collaboration-stage-layout';
import type { CallPanel } from './control-bar';
import {
  AccountGatedNotesDrawer,
  AccountGatedPersonalDrawer,
  accountGatedCollaboration,
} from './call-account-gates';
import { JoinOutcome } from './join-outcome';
import { LeaveDialog } from './leave-dialog';
import { CallWaitingBanner } from './call-waiting-banner';
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
import { runsRoomActivities } from '../tools/live-activities/activity-manager';
import { meetTools } from '../tools/registry';
import { type ToolDrawer, useMeetTools } from '../tools/use-meet-tools';
import { useRoomNavigation } from '../hooks/use-room-navigation';
import { ActivitiesMenu } from './activities-menu';
import { FollowBanner } from './room-navigation-controls';
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
  const collaborationT = useTranslations('meet.collaboration');
  const [programmingOpen, setShowProgramming] = useState(false);
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
  const presenceOnly = state.settings.transport === 'presence';
  // Set once a host or co-host has brought this person to a shared surface.
  const [broughtIn, setBroughtIn] = useState(false);
  const canCollaborate = roomTools.canUse || broughtIn;
  const showProgramming = canCollaborate && programmingOpen;
  const showDocument = canCollaborate && documentOpen;
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
  const { busyDevices, runMediaAction } = useCallMediaActions(
    meetingId,
    leftRef
  );
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
    // Whoever runs activities reaches those, and only those, when browsing
    // the tools is for hosts only.
    available: roomTools.canUse || runsRoomActivities(state),
    activitiesOnly: !roomTools.canUse,
    canRunActivities: runsRoomActivities(state),
    selfUserId: state.selfUserId,
    people: state.participants,
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
  // Opening only shows the panel. The host picks the resource in its dialog;
  // nothing is created or selected for the room before that choice.
  const openProgramming = (open: boolean) => {
    setShowDocument(false);
    setShowProgramming(open);
  };
  const openDocument = (open: boolean) => {
    setShowProgramming(false);
    setShowDocument(open);
  };
  const nav = useRoomNavigation({
    room,
    surface: { programming: showProgramming, document: showDocument, drawer },
    apply: (next, { forced }) => {
      // A host or co-host who brings someone to a surface opens it for them.
      if (forced && (next.programming || next.document)) setBroughtIn(true);
      if (next.programming) {
        if (!showProgramming) openProgramming(true);
      } else if (next.document) openDocument(true);
      else {
        setShowProgramming(false);
        setShowDocument(false);
      }
      setDrawer(next.drawer as typeof drawer);
    },
    access: {
      browse: roomTools.canUse,
      account: !requiresAccount,
      tools: liveTools,
      toolIds: meetTools.map((tool) => tool.id),
    },
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
      <CallHeader
        meetingId={meetingId}
        title={room.state.title ?? meetingName}
        canManage={canManage}
        onRenamed={room.renameMeeting}
        presenceOnly={presenceOnly}
        solo={participants.length === 1 && !state.liveAssistant}
        recording={state.recording.state === 'recording'}
        connection={room.connectionStatus}
        onRetry={retryConnection}
        actions={
          <>
            <RoomAssistantAudio
              room={room}
              audioSuppressed={sharedAudio.shared}
              canManage={canManage}
              meetingId={meetingId}
              outputDeviceId={outputDeviceId}
            />
            {!presenceOnly && (
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
              wsId={wsId}
              room={room}
              telemetry={telemetry.data}
              ai={ai}
              canManage={canManage}
              sound={notifications.sound}
              onSound={notifications.toggleSound}
              outputDeviceId={outputDeviceId}
              onOutput={setOutputDeviceId}
              activities={
                roomTools.canConfigure
                  ? {
                      mode: toolMode,
                      onMode: (advancedTools) =>
                        room.updateSettings({ advancedTools }),
                      participantNavigation:
                        state.settings.participantNavigation !== false,
                      onParticipantNavigation: (participantNavigation) =>
                        room.updateSettings({ participantNavigation }),
                    }
                  : undefined
              }
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
          </>
        }
      />
      {canManage && (
        <CallWaitingBanner
          waiting={state.waiting.length}
          participants={participants.length}
          onOpen={() => setDrawer('participants')}
        />
      )}
      <CallResourceNotice error={state.error} />
      <FollowBanner nav={nav} />
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
              !presenceOnly ? (
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
              ) : showProgramming || showDocument ? null : (
                <CallPresenceRoster
                  participants={participants}
                  selfUserId={state.selfUserId}
                  raisedHandUserIds={state.stage.raisedHandUserIds}
                  onProgramming={
                    roomTools.canUse ? () => openProgramming(true) : undefined
                  }
                  onDocument={
                    roomTools.canUse ? () => openDocument(true) : undefined
                  }
                  activities={
                    tools.shown.length ? (
                      <ActivitiesMenu
                        tools={tools.shown}
                        activeToolId={tools.activeId}
                        onTool={tools.toggle}
                      />
                    ) : null
                  }
                />
              )
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
          />
        )}
      </div>
      <CallControlDock
        room={room}
        canManage={canManage}
        panel={panel}
        personal={{
          active: drawer === 'personal',
          toggle: () => setDrawer(drawer === 'personal' ? null : 'personal'),
        }}
        onDrawer={setDrawer}
        sharedAudio={sharedAudio}
        busyDevices={busyDevices}
        runMediaAction={(action, device) => void runMediaAction(action, device)}
        recording={recording}
        handRaised={selfHandRaised}
        participantCount={participants.length + (state.liveAssistant ? 1 : 0)}
        unreadChat={
          panel === 'chat'
            ? 0
            : countUnreadChatMessages(state.chat, lastReadChatId)
        }
        onLeave={() => (canManage ? setLeaveDialog(true) : leaveNow())}
        roomTools={roomTools}
        tools={tools}
        activities={activities}
        programming={{
          active: showProgramming,
          toggle: () => openProgramming(!showProgramming),
        }}
        document={{
          active: showDocument,
          toggle: () => openDocument(!showDocument),
        }}
        layout={layout}
        setLayout={(next) => {
          setLayout(next);
          setFocus(null);
        }}
        nav={nav}
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
        <CallSettingsLinkProvider>
          <CallShellContent {...props} />
        </CallSettingsLinkProvider>
      </CallPanelOwnerContext.Provider>
    </PlaybackVolumeProvider>
  );
}
