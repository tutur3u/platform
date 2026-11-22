'use client';
import { Captions, CodeXml, FileText, LayoutGrid } from '@tuturuuu/icons';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import type { useRoomRecording } from '../hooks/use-room-recording';
import type { useSharedRoomAudio } from '../hooks/use-shared-room-audio';
import type { RoomNavigation } from '../hooks/use-room-navigation';
import type { MeetRoomController } from '../lib/room-controller';
import { type MeetToolDefinition, meetTools } from '../tools/registry';
import { ActivitiesMenu } from './activities-menu';
import type { ActivityEntry } from './call-activities';
import { useCallActivityPages } from './call-activity-pages';
import {
  CallExtras,
  CallExtrasDialogs,
  useCallExtrasDialog,
} from './call-extras';
import { CallReactionsMenu } from './call-reactions';
import type { useRoomTools } from './call-room-tools';
import {
  useCallSettingsDialog,
  useOpenCallSettings,
} from './call-settings-link';
import type { CallLayout } from './call-stage';
import { type CallPanel, ControlBar, ControlSwitchRow } from './control-bar';
import { useRoomNavigationControls } from './room-navigation-controls';

type Device = 'microphone' | 'camera' | 'screen';
type Toggle = { active: boolean; toggle: () => void };

/** Quiet label of where this person is, shown left of the root controls. */
function SurfaceContext({ nav }: { nav: RoomNavigation }) {
  const t = useTranslations('meet.call.navigation');
  if (nav.onStage) return null;
  const Icon =
    nav.view.surface === 'programming'
      ? CodeXml
      : nav.view.surface === 'document'
        ? FileText
        : LayoutGrid;
  return (
    <span className="flex min-w-0 items-center gap-2">
      <Icon aria-hidden="true" className="size-4 shrink-0" />
      <span className="truncate">
        {t('context', { surface: nav.surfaceName })}
      </span>
    </span>
  );
}

/**
 * The call's root bar with everything it opens: reactions, Activities (with
 * the room timer and Room activities pages), the More menu with Transcript,
 * Follow, Summon and Settings, and the dialogs those rows launch.
 */
export function CallControlDock({
  meetingId,
  room,
  canManage,
  panel,
  personal,
  onDrawer,
  sharedAudio,
  busyDevices,
  runMediaAction,
  recording,
  handRaised,
  participantCount,
  unreadChat,
  onLeave,
  roomTools,
  tools,
  activities,
  programming,
  document,
  layout,
  setLayout,
  nav,
  transcript,
}: {
  meetingId: string;
  room: MeetRoomController;
  canManage: boolean;
  panel: CallPanel;
  personal: Toggle;
  onDrawer: (drawer: CallPanel | 'feedback') => void;
  sharedAudio: ReturnType<typeof useSharedRoomAudio>;
  busyDevices: Partial<Record<Device, boolean>>;
  runMediaAction: (action: () => Promise<void>, device: Device) => void;
  recording: ReturnType<typeof useRoomRecording>;
  handRaised: boolean;
  participantCount: number;
  unreadChat: number;
  onLeave: () => void;
  roomTools: ReturnType<typeof useRoomTools>;
  tools: {
    shown: readonly MeetToolDefinition[];
    activeId: string | null;
    toggle: (id: string) => void;
  };
  activities: {
    liveControl: ReactNode;
    controls: ReactNode;
    entries: readonly ActivityEntry[];
  };
  programming: Toggle;
  document: Toggle;
  layout: CallLayout;
  setLayout: (layout: CallLayout) => void;
  nav: RoomNavigation;
  /** Present for people allowed to read the transcript and notes. */
  transcript?: Toggle;
}) {
  const t = useTranslations('meet.call');
  const aiT = useTranslations('meet.ai');
  const { state } = room;
  const presenceOnly = state.settings.transport === 'presence';
  const [extrasDialog, setExtrasDialog] = useCallExtrasDialog();
  const navControls = useRoomNavigationControls(nav);
  const settingsDialog = useCallSettingsDialog();
  // Only a call that links its settings dialog can open it from More.
  const settingsLinked = !!useOpenCallSettings();
  const pages = useCallActivityPages({
    meetingId,
    room,
    roomTools,
    liveShortcuts: activities.controls,
    personal,
  });
  const activitiesMenu = (
    <ActivitiesMenu
      tools={roomTools.showPreview ? meetTools : tools.shown}
      activeToolId={tools.activeId}
      onTool={tools.toggle}
      extra={activities.entries}
      pages={pages}
      collaboration={roomTools.canUse ? { programming, document } : undefined}
      preview={
        roomTools.showPreview
          ? { onFeedback: () => onDrawer('feedback') }
          : undefined
      }
    />
  );
  return (
    <>
      <ControlBar
        presenceOnly={presenceOnly}
        onPresenceChange={
          canManage
            ? (enabled) =>
                room.updateSettings({
                  transport: enabled ? 'presence' : 'media',
                })
            : undefined
        }
        activePanel={panel}
        activities={activitiesMenu}
        reactions={<CallReactionsMenu react={room.react} />}
        navigation={nav.allowed ? navControls.menu : undefined}
        onOpenSettings={
          settingsLinked ? () => settingsDialog.setOpen(true) : undefined
        }
        context={<SurfaceContext nav={nav} />}
        liveActivity={activities.liveControl}
        // Without tool access, More is the only place that lists every live
        // poll and Quiz Arena shortcut; the bar shows just one of them.
        liveMenu={roomTools.canUse ? undefined : activities.controls}
        cameraOn={room.media.videoEnabled}
        micOn={!sharedAudio.microphonePaused && room.media.audioEnabled}
        screenOn={room.media.screenEnabled}
        handRaised={handRaised}
        busyDevices={busyDevices}
        participantCount={participantCount}
        recordingBusy={recording.isBusy}
        recordingOn={state.recording.state === 'recording'}
        unreadChat={unreadChat}
        waitingCount={state.waiting.length}
        viewer={state.role === 'viewer'}
        onLeave={onLeave}
        onToggleMic={() =>
          sharedAudio.microphonePaused
            ? runMediaAction(sharedAudio.useOwnMicrophone, 'microphone')
            : runMediaAction(room.toggleMicrophone, 'microphone')
        }
        onToggleCamera={() => runMediaAction(room.toggleCamera, 'camera')}
        onToggleScreen={() => runMediaAction(room.toggleScreenShare, 'screen')}
        onToggleHand={() => room.raiseHand(!handRaised)}
        onTogglePanel={onDrawer}
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
            {transcript && (
              <ControlSwitchRow
                icon={Captions}
                label={aiT('title')}
                checked={transcript.active}
                onCheckedChange={transcript.toggle}
                closeOnChange
              />
            )}
            <CallExtras
              layout={layout}
              look={room.cameraLook}
              react={room.react}
              presenceOnly={presenceOnly}
              onOpen={setExtrasDialog}
            />
          </>
        }
      />
      <CallExtrasDialogs
        dialog={extrasDialog}
        onDialog={setExtrasDialog}
        layout={layout}
        setLayout={setLayout}
        look={room.cameraLook}
        setLook={room.setCameraLook}
        stream={room.localStream}
      />
      {navControls.dialogs}
    </>
  );
}
