'use client';

import {
  CircleDot,
  Ellipsis,
  Hand,
  Loader2,
  MessageSquare,
  Mic,
  MicOff,
  MonitorUp,
  PhoneOff,
  Square,
  Users,
  Video,
  VideoOff,
} from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import {
  type ComponentType,
  createContext,
  type ReactNode,
  useContext,
  useState,
  useSyncExternalStore,
} from 'react';
import { useLargeRoomLabels } from '../lib/large-room-labels';
import { readRoomControls, subscribeRoomControls } from '../lib/room-actions';

export type CallPanel = 'chat' | 'participants' | null;

const CloseCallOverflow = createContext<(() => void) | null>(null);

export function ControlButton({
  active,
  danger,
  attention,
  icon: Icon,
  label,
  onClick,
  badge,
  busy,
  locked,
}: {
  active?: boolean;
  busy?: boolean;
  locked?: boolean;
  badge?: number;
  danger?: boolean;
  attention?: boolean;
  icon: ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
}) {
  const closeOverflow = useContext(CloseCallOverflow);
  const button = (
    <Button
      aria-label={label}
      aria-busy={busy}
      disabled={busy || locked}
      aria-pressed={active}
      className={cn(
        'relative',
        closeOverflow
          ? 'h-auto min-h-11 w-full justify-start gap-3 whitespace-normal rounded-md px-3 py-2 text-left'
          : 'size-11 shrink-0 rounded-full',
        // Google Meet's convention: a lit control means the device is OFF.
        !danger && active && 'bg-foreground/15 hover:bg-foreground/20',
        attention &&
          'bg-dynamic-orange/20 text-dynamic-orange ring-2 ring-dynamic-orange/60 hover:bg-dynamic-orange/30'
      )}
      onClick={() => {
        onClick();
        closeOverflow?.();
      }}
      size={closeOverflow ? 'default' : 'icon'}
      type="button"
      variant={danger ? 'destructive' : 'ghost'}
    >
      {busy ? (
        <Loader2 className="size-5 animate-spin motion-reduce:animate-none" />
      ) : (
        <Icon className="size-5" />
      )}
      {closeOverflow ? <span className="min-w-0 flex-1">{label}</span> : null}
      {badge ? (
        <span className="absolute -top-0.5 -right-0.5 grid min-w-4 place-items-center rounded-full bg-dynamic-blue px-1 font-medium text-[0.6rem] text-white">
          {badge > 9 ? '9+' : badge}
        </span>
      ) : null}
    </Button>
  );
  if (closeOverflow) return button;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {locked ? (
          <span tabIndex={0} aria-label={label}>
            {button}
          </span>
        ) : (
          button
        )}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

const noRoomControls = () => undefined;

export function ControlBar({
  activePanel,
  mediaLocks,
  extraControls,
  liveActivity,
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
}: {
  activePanel: CallPanel;
  mediaLocks?: { audio: boolean; video: boolean; screen: boolean };
  extraControls?: ReactNode;
  liveActivity?: ReactNode;
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
}) {
  const t = useTranslations('meet.call');
  const labels = useLargeRoomLabels();
  const controls = useSyncExternalStore(
    subscribeRoomControls,
    readRoomControls,
    noRoomControls
  );
  const locked = mediaLocks ?? controls?.locked;
  const [moreOpen, setMoreOpen] = useState(false);
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

  return (
    <div
      role="group"
      aria-label={t('control_bar')}
      className="flex flex-nowrap items-center justify-center gap-1 border-t bg-background/95 px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur sm:gap-2 sm:px-4"
    >
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
      <ControlButton
        active={activePanel === 'participants'}
        badge={waitingCount}
        icon={Users}
        label={t('participants', { count: participantCount })}
        onClick={() =>
          onTogglePanel(activePanel === 'participants' ? null : 'participants')
        }
      />
      <ControlButton
        active={activePanel === 'chat'}
        badge={unreadChat}
        icon={MessageSquare}
        label={t('chat')}
        onClick={() => onTogglePanel(activePanel === 'chat' ? null : 'chat')}
      />

      {liveActivity && <div className="hidden sm:block">{liveActivity}</div>}
      <Popover open={moreOpen} onOpenChange={setMoreOpen}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button
                aria-label={t(
                  liveActivity ? 'more_actions_activity' : 'more_actions'
                )}
                className="relative size-11 shrink-0 rounded-full data-[state=open]:bg-accent"
                size="icon"
                type="button"
                variant="ghost"
              >
                <Ellipsis className="size-5" />
                {liveActivity && (
                  <span
                    aria-hidden="true"
                    className="absolute top-1 right-1 size-2 rounded-full bg-primary sm:hidden"
                  />
                )}
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent>{t('more_actions')}</TooltipContent>
        </Tooltip>
        <PopoverContent
          aria-label={t('more_actions')}
          className="flex max-h-[min(26rem,70dvh)] w-72 max-w-[calc(100vw-1rem)] flex-col gap-1 overflow-y-auto p-2"
          side="top"
          sideOffset={8}
        >
          <CloseCallOverflow.Provider value={() => setMoreOpen(false)}>
            <div className="sm:hidden">{shareScreen}</div>
            <ControlButton
              active={handRaised}
              attention={handRaised}
              icon={Hand}
              label={handRaised ? t('lower_hand') : t('raise_hand')}
              onClick={onToggleHand}
            />
            {onToggleRecording ? (
              <ControlButton
                active={recordingOn}
                icon={recordingOn ? Square : CircleDot}
                busy={recordingBusy}
                attention={recordingOn}
                label={recordingOn ? t('stop_recording') : t('start_recording')}
                onClick={onToggleRecording}
              />
            ) : null}
            {extraControls}
          </CloseCallOverflow.Provider>
        </PopoverContent>
      </Popover>
      <div
        aria-hidden="true"
        className="mx-1 hidden h-6 w-px bg-border sm:block"
      />

      <ControlButton
        danger
        icon={PhoneOff}
        label={t('leave')}
        onClick={onLeave}
      />
    </div>
  );
}
