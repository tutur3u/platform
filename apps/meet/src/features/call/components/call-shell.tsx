'use client';

import { Circle, WifiOff } from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { useCallRecording } from '../hooks/use-call-recording';
import { useMeetRoom } from '../hooks/use-meet-room';
import {
  isHandRaised,
  selectFocusedUserId,
  selectOthers,
  selectSelf,
} from '../lib/call-state';
import { type CallPanel, ControlBar } from './control-bar';
import { CopyInvite } from './copy-invite';
import { Lobby } from './lobby';
import { ParticipantTile } from './participant-tile';
import { SidePanel } from './side-panel';

/** Google Meet keeps tiles readable by growing columns with the crowd. */
function gridColumns(count: number) {
  if (count <= 1) return 'grid-cols-1';
  if (count <= 4) return 'grid-cols-1 sm:grid-cols-2';
  if (count <= 9) return 'grid-cols-2 lg:grid-cols-3';
  return 'grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';
}

export function CallShell({
  defaultDisplayName,
  leaveHref,
  meetingId,
  meetingName,
  realtimeUrl,
  token,
  wsId,
}: {
  defaultDisplayName: string;
  leaveHref: string;
  meetingId: string;
  meetingName: string;
  realtimeUrl: string;
  token: string;
  wsId: string;
}) {
  const t = useTranslations('meet.call');
  const router = useRouter();
  const room = useMeetRoom({ meetingId, realtimeUrl, token, wsId });
  const { state } = room;

  const [joined, setJoined] = useState(false);
  const [panel, setPanel] = useState<CallPanel>(null);
  const [readChatCount, setReadChatCount] = useState(0);

  const self = selectSelf(state);
  const others = useMemo(() => selectOthers(state), [state]);
  const focusedUserId = useMemo(() => selectFocusedUserId(state), [state]);
  const canManage = state.role === 'host';
  const recording = useCallRecording({
    meetingId,
    onStateChange: room.setRecordingState,
    wsId,
  });
  const handRaised = state.selfUserId
    ? isHandRaised(state, state.selfUserId)
    : false;

  useEffect(() => {
    if (panel === 'chat') setReadChatCount(state.chat.length);
  }, [panel, state.chat.length]);

  useEffect(() => {
    if (state.admission === 'denied') router.push(leaveHref);
  }, [leaveHref, router, state.admission]);

  if (!joined || state.admission === 'waiting') {
    return (
      <Lobby
        defaultDisplayName={defaultDisplayName}
        isJoining={state.admission === 'connecting'}
        meetingName={meetingName}
        onJoin={async ({ audioEnabled, videoEnabled }) => {
          setJoined(true);
          if (audioEnabled) await room.toggleMicrophone();
          if (videoEnabled) await room.toggleCamera();
        }}
        waiting={state.admission === 'waiting'}
      />
    );
  }

  const tiles = self ? [self, ...others] : others;
  const focused = tiles.find((entry) => entry.userId === focusedUserId);
  const isSpotlight = tiles.length > 2 && Boolean(focused);

  return (
    <div className="flex h-dvh flex-col bg-background">
      <header className="flex items-center gap-3 border-b px-4 py-2.5">
        <h1 className="min-w-0 flex-1 truncate font-medium text-sm">
          {meetingName}
        </h1>
        <CopyInvite meetingId={meetingId} meetingName={meetingName} />
        {state.recording.state === 'recording' ? (
          <span className="flex items-center gap-1.5 rounded-full bg-dynamic-red/10 px-2 py-0.5 font-medium text-dynamic-red text-xs">
            <Circle className="size-2 animate-pulse fill-current" />
            {t('recording')}
          </span>
        ) : null}
        {room.connectionStatus === 'open' ? null : (
          <span className="flex items-center gap-1.5 text-muted-foreground text-xs">
            <WifiOff className="size-3.5" />
            {t('reconnecting')}
          </span>
        )}
      </header>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <main className="min-h-0 flex-1 p-3">
          {isSpotlight && focused ? (
            <div className="flex h-full flex-col gap-3">
              <ParticipantTile
                className="min-h-0 flex-1"
                handRaised={isHandRaised(state, focused.userId)}
                isSelf={focused.userId === state.selfUserId}
                participant={focused}
                stream={
                  focused.userId === state.selfUserId
                    ? room.localStream
                    : Object.values(room.remoteStreams)[0]
                }
              />
              <div className="flex shrink-0 gap-2 overflow-x-auto pb-1">
                {tiles
                  .filter((entry) => entry.userId !== focused.userId)
                  .map((entry) => (
                    <ParticipantTile
                      className="aspect-video w-40 shrink-0"
                      handRaised={isHandRaised(state, entry.userId)}
                      isSelf={entry.userId === state.selfUserId}
                      key={entry.userId}
                      participant={entry}
                      stream={
                        entry.userId === state.selfUserId
                          ? room.localStream
                          : undefined
                      }
                    />
                  ))}
              </div>
            </div>
          ) : (
            <div
              className={cn(
                'grid h-full auto-rows-fr gap-3',
                gridColumns(tiles.length)
              )}
            >
              {tiles.map((entry) => (
                <ParticipantTile
                  handRaised={isHandRaised(state, entry.userId)}
                  isSelf={entry.userId === state.selfUserId}
                  key={entry.userId}
                  participant={entry}
                  stream={
                    entry.userId === state.selfUserId
                      ? room.localStream
                      : Object.values(room.remoteStreams)[0]
                  }
                />
              ))}
            </div>
          )}
        </main>

        {panel ? (
          <SidePanel
            canManage={canManage}
            chat={state.chat}
            onClose={() => setPanel(null)}
            onDecideAdmission={room.decideAdmission}
            onMute={(userId) => room.muteParticipant(userId, ['audio'])}
            onRemove={room.removeParticipant}
            onSendChat={room.sendChat}
            panel={panel}
            participants={tiles}
            raisedHandUserIds={state.stage.raisedHandUserIds}
            selfUserId={state.selfUserId}
            waiting={state.waiting}
          />
        ) : null}
      </div>

      <ControlBar
        activePanel={panel}
        cameraOn={room.media.videoEnabled}
        handRaised={handRaised}
        micOn={room.media.audioEnabled}
        onLeave={() => router.push(leaveHref)}
        onToggleCamera={() => void room.toggleCamera()}
        onToggleHand={() => room.raiseHand(!handRaised)}
        onToggleMic={() => void room.toggleMicrophone()}
        onTogglePanel={setPanel}
        onToggleRecording={
          canManage ? () => void recording.toggle() : undefined
        }
        onToggleScreen={() => void room.toggleScreenShare()}
        participantCount={tiles.length}
        recordingBusy={recording.isBusy}
        recordingOn={recording.isRecording}
        screenOn={room.media.screenEnabled}
        unreadChat={Math.max(0, state.chat.length - readChatCount)}
        waitingCount={canManage ? state.waiting.length : 0}
      />
    </div>
  );
}
