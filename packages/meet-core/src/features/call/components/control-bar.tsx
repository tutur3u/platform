'use client';

import {
  Hand,
  MessageSquare,
  Mic,
  MicOff,
  MonitorUp,
  PhoneOff,
  Users,
  Video,
  VideoOff,
} from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { type ReactNode, useSyncExternalStore } from 'react';
import { useLargeRoomLabels } from '../lib/large-room-labels';
import { readRoomControls, subscribeRoomControls } from '../lib/room-actions';
import { CallMoreMenu } from './call-more-menu';
import { ControlButton, controlPillClass } from './control-button';

export {
  ControlButton,
  ControlMenuLabel,
  ControlMenuScope,
  ControlSwitchRow,
  controlButtonClass,
  controlPillClass,
  controlRowClass,
} from './control-button';

export type CallPanel = 'chat' | 'participants' | null;

/** The bottom-right people count; it opens the participants panel. */
function PeopleControl({
  active,
  count,
  waiting,
  onClick,
}: {
  active: boolean;
  count: number;
  waiting: number;
  onClick: () => void;
}) {
  const t = useTranslations('meet.call');
  const label = t('participants', { count });
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          aria-label={label}
          aria-pressed={active}
          className={cn(
            controlPillClass,
            'px-3.5 tabular-nums',
            active && 'border-transparent bg-foreground/15'
          )}
          onClick={onClick}
          type="button"
          variant="ghost"
        >
          <Users className="size-5" />
          {count}
          {waiting ? (
            <span className="absolute -top-0.5 -right-0.5 grid min-w-4 place-items-center rounded-full bg-dynamic-blue px-1 font-medium text-[0.6rem] text-white">
              {waiting > 9 ? '9+' : waiting}
            </span>
          ) : null}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

const noRoomControls = () => undefined;

export function ControlBar({
  activePanel,
  tools,
  toolsMenu,
  activities,
  reactions,
  navigation,
  context,
  mediaLocks,
  extraControls,
  liveActivity,
  liveMenu,
  busyDevices,
  cameraOn,
  handRaised,
  micOn,
  onLeave,
  onToggleCamera,
  onToggleHand,
  onTogglePanel,
  onToggleMic,
  onToggleRecording,
  onToggleScreen,
  participantCount,
  recordingBusy,
  recordingOn,
  screenOn,
  unreadChat,
  waitingCount,
  viewer = false,
  presenceOnly = false,
  onPresenceChange,
  onOpenSettings,
}: {
  activePanel: CallPanel;
  /** Legacy tools hub trigger, used when no `activities` control is given. */
  tools?: ReactNode;
  /** Tool rows for the phone overflow menu when no `activities` control is given. */
  toolsMenu?: ReactNode;
  /** The labeled Activities entry; it replaces the tools hub. */
  activities?: ReactNode;
  /** Root-bar reactions; phones in media rooms reach them through More. */
  reactions?: ReactNode;
  /** Follow and Summon rows for the More menu. */
  navigation?: ReactNode;
  /** Opens the meeting settings from the More menu. */
  onOpenSettings?: () => void;
  /** Quiet label of the surface this person is on, left of the controls. */
  context?: ReactNode;
  mediaLocks?: { audio: boolean; video: boolean; screen: boolean };
  extraControls?: ReactNode;
  liveActivity?: ReactNode;
  /** Every live shortcut for the More menu; see `CallMoreMenu`. */
  liveMenu?: ReactNode;
  busyDevices?: { microphone?: boolean; camera?: boolean; screen?: boolean };
  cameraOn: boolean;
  handRaised: boolean;
  micOn: boolean;
  onLeave: () => void;
  onToggleCamera: () => void;
  onToggleHand: () => void;
  onTogglePanel: (panel: CallPanel) => void;
  onToggleMic: () => void;
  /** Absent for participants who cannot control recording. */
  onToggleRecording?: () => void;
  onToggleScreen: () => void;
  participantCount: number;
  recordingBusy?: boolean;
  recordingOn?: boolean;
  screenOn: boolean;
  unreadChat: number;
  waitingCount: number;
  viewer?: boolean;
  presenceOnly?: boolean;
  onPresenceChange?: (enabled: boolean) => void;
}) {
  const t = useTranslations('meet.call');
  const labels = useLargeRoomLabels();
  const controls = useSyncExternalStore(
    subscribeRoomControls,
    readRoomControls,
    noRoomControls
  );
  const locked = mediaLocks ?? controls?.locked;
  const hub = activities ?? tools;
  const shareScreen = (
    <ControlButton
      active={screenOn}
      busy={busyDevices?.screen}
      icon={MonitorUp}
      locked={locked?.screen}
      label={
        locked?.screen
          ? viewer
            ? t('viewer_screen_unavailable')
            : labels('screen_locked_hint')
          : screenOn
            ? t('stop_sharing')
            : t('share_screen')
      }
      onClick={onToggleScreen}
    />
  );
  const chat = (
    <ControlButton
      active={activePanel === 'chat'}
      badge={unreadChat}
      icon={MessageSquare}
      label={t('chat')}
      onClick={() => onTogglePanel(activePanel === 'chat' ? null : 'chat')}
    />
  );
  const hand = (
    <ControlButton
      active={handRaised}
      attention={handRaised}
      icon={Hand}
      label={handRaised ? t('lower_hand') : t('raise_hand')}
      onClick={onToggleHand}
    />
  );

  return (
    <div
      role="group"
      aria-label={t('control_bar')}
      className="flex flex-nowrap items-center gap-1 border-t bg-background/95 px-2 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] backdrop-blur sm:gap-2.5 sm:px-4"
    >
      <div className="hidden min-w-0 flex-1 items-center text-muted-foreground text-sm lg:flex">
        {context}
      </div>
      <div className="flex shrink-0 items-center gap-1 sm:gap-2.5">
        {!presenceOnly && (
          <>
            <ControlButton
              active={!micOn}
              busy={busyDevices?.microphone}
              icon={micOn ? Mic : MicOff}
              locked={locked?.audio}
              label={
                locked?.audio
                  ? viewer
                    ? t('viewer_mic_unavailable')
                    : labels('mic_locked_hint')
                  : micOn
                    ? t('mute')
                    : t('unmute')
              }
              onClick={onToggleMic}
            />
            <ControlButton
              active={!cameraOn}
              busy={busyDevices?.camera}
              icon={cameraOn ? Video : VideoOff}
              locked={locked?.video}
              label={
                locked?.video
                  ? viewer
                    ? t('viewer_camera_unavailable')
                    : labels('camera_locked_hint')
                  : cameraOn
                    ? t('camera_off')
                    : t('camera_on')
              }
              onClick={onToggleCamera}
            />
            <div className="hidden sm:block">{shareScreen}</div>
          </>
        )}
        {reactions && (
          <div className={presenceOnly ? undefined : 'hidden sm:block'}>
            {reactions}
          </div>
        )}
        <div className="hidden md:block">{hand}</div>
        {liveActivity && <div className="hidden sm:block">{liveActivity}</div>}
        {hub && (
          <div className={activities ? undefined : 'hidden sm:block'}>
            {hub}
          </div>
        )}
        <CallMoreMenu
          phone={{
            shareScreen: presenceOnly ? undefined : shareScreen,
            chat,
            hand,
          }}
          liveActivity={liveActivity}
          liveMenu={liveMenu}
          toolsMenu={activities ? undefined : toolsMenu}
          recording={
            onToggleRecording
              ? {
                  on: recordingOn,
                  busy: recordingBusy,
                  toggle: onToggleRecording,
                }
              : undefined
          }
          extraControls={extraControls}
          navigation={navigation}
          onOpenSettings={onOpenSettings}
          presence={
            onPresenceChange
              ? { on: presenceOnly, onChange: onPresenceChange }
              : undefined
          }
        />
        <div
          aria-hidden="true"
          className="hidden h-6 w-px bg-border sm:block"
        />
        <ControlButton
          danger
          icon={PhoneOff}
          label={t('leave')}
          onClick={onLeave}
        />
      </div>
      <div className="flex shrink-0 flex-1 items-center justify-end gap-1 sm:gap-2.5">
        {/* The narrowest phones reach chat through More, so nothing overlaps. */}
        <div className="hidden min-[360px]:block">{chat}</div>
        <PeopleControl
          active={activePanel === 'participants'}
          count={participantCount}
          waiting={waitingCount}
          onClick={() =>
            onTogglePanel(
              activePanel === 'participants' ? null : 'participants'
            )
          }
        />
      </div>
    </div>
  );
}
