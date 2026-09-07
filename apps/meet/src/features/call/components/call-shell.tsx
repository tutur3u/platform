'use client';
import { useQuery } from '@tanstack/react-query';
import { Circle, Loader2, ShieldCheck, WifiOff } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { toast } from '@tuturuuu/ui/sonner';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MeetingAiPanel } from '@/features/meeting-ai/meeting-ai-panel';
import { useMeetingAi } from '@/features/meeting-ai/use-meeting-ai';
import { useCallRecording } from '../hooks/use-call-recording';
import { useMeetRoom } from '../hooks/use-meet-room';
import {
  countUnreadChatMessages,
  isHandRaised,
  selectOthers,
  selectSelf,
} from '../lib/call-state';
import { getMediaErrorDiagnostic, getMediaErrorKey } from '../lib/media-error';
import { CallExtras } from './call-extras';
import { type CallLayout, CallStage } from './call-stage';
import { ConnectionPanel } from './connection-panel';
import { type CallPanel, ControlBar } from './control-bar';
import { CopyInvite } from './copy-invite';
import { LeaveDialog } from './leave-dialog';
import { Lobby } from './lobby';
import { ReactionOverlay } from './reaction-overlay';
import { SidePanel } from './side-panel';

type Device = 'microphone' | 'camera' | 'screen';

export function CallShell({
  defaultDisplayName,
  defaultAvatarUrl,
  canReadWorkspace = true,
  leaveHref,
  meetingId,
  meetingName,
  realtimeUrl,
  token,
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
  const [panel, setPanel] = useState<CallPanel>(null);
  const [layout, setLayout] = useState<CallLayout>('auto');
  const [focus, setFocus] = useState<string | null>(null);
  const [busyDevices, setBusyDevices] = useState<
    Partial<Record<Device, boolean>>
  >({});
  const pendingDevices = useRef(new Set<Device>());
  const room = useMeetRoom({ meetingId, realtimeUrl, token, wsId });
  const { state } = room;
  const canManage = state.role === 'host';
  const canReadNotes = canManage || state.settings.shareNotes;
  const audioStreams = useMemo(
    () => [
      ...(room.localStream ? [room.localStream] : []),
      ...Object.values(room.remoteStreams),
    ],
    [room.localStream, room.remoteStreams]
  );
  const ai = useMeetingAi(wsId, meetingId, audioStreams, !left, canReadNotes);
  const recording = useCallRecording({
    meetingId,
    wsId,
    onStateChange: room.setRecordingState,
  });
  const telemetry = useQuery({
    queryKey: ['meet-media-health', meetingId],
    queryFn: room.getMediaDiagnostics,
    enabled: joined && !left,
    refetchInterval: 2000,
    retry: false,
    gcTime: 0,
  });
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
    room.leave();
    setLeft(true);
    setLeaveDialog(false);
    setSaving(true);
    void Promise.allSettled([ai.finish(), recording.stop()]).then((results) => {
      if (results.some((result) => result.status === 'rejected'))
        toast.error(aiT('failed'));
      setSaving(false);
    });
  }, [room.leave, ai.finish, recording.stop, aiT]);
  useEffect(() => {
    if (panel === 'chat') setLastReadChatId(newestChatId);
  }, [panel, newestChatId]);
  useEffect(() => {
    if (state.ended || state.admission === 'denied') leaveNow();
  }, [state.ended, state.admission, leaveNow]);

  if (left || state.ended)
    return (
      <div className="min-h-dvh bg-background px-4 py-12">
        <div className="mx-auto max-w-2xl space-y-6">
          <div className="rounded-2xl border bg-card p-8 text-center">
            <ShieldCheck className="mx-auto mb-4 size-10 text-muted-foreground" />
            <h1 className="font-semibold text-2xl">
              {t(state.ended ? 'call_ended_title' : 'call_left_title')}
            </h1>
            <p className="mt-2 text-muted-foreground text-sm">
              {t('call_left_hint')}
            </p>
            {saving && (
              <p
                role="status"
                className="mt-4 flex items-center justify-center gap-2 text-sm"
              >
                <Loader2 className="size-4 animate-spin" />
                {t('saving_notes')}
              </p>
            )}
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              {!state.ended && (
                <Button onClick={() => window.location.reload()}>
                  {t('rejoin_call')}
                </Button>
              )}
              <Button variant="outline" asChild>
                <Link href={backHref}>{t('back_to_meet')}</Link>
              </Button>
            </div>
          </div>
          {canReadNotes && <MeetingAiPanel ai={ai} />}
        </div>
      </div>
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
        <h1 className="min-w-0 flex-1 truncate font-medium text-sm">
          {meetingName}
        </h1>
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
            {ai.data ? ` · $${ai.data.estimatedCostUsd.toFixed(4)}` : ''}
          </Button>
        )}
        <ConnectionPanel
          read={room.getMediaDiagnostics}
          reconnect={room.reconnectMedia}
          telemetry={telemetry.data}
        />
        <CopyInvite meetingId={meetingId} meetingName={meetingName} />
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
          <CallStage
            room={room}
            layout={layout}
            focus={focus}
            onFocus={(key) => {
              setFocus(key);
              if (key) setLayout('spotlight');
              else setLayout('auto');
            }}
          />
          <ReactionOverlay state={state} />
        </main>
        {showAi && canReadNotes && (
          <aside className="max-h-[50dvh] w-full shrink-0 overflow-y-auto p-3 md:max-h-none md:w-96">
            <MeetingAiPanel ai={ai} inCall />
          </aside>
        )}
        {panel && (
          <SidePanel
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
        recordingOn={recording.isRecording}
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
          canManage ? () => void recording.toggle() : undefined
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
