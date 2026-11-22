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
import { Label } from '@tuturuuu/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { Switch } from '@tuturuuu/ui/switch';
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

/** One shape for every round call control: top bar, bottom bar and tools hub. */
export const controlButtonClass =
  'relative size-11 shrink-0 rounded-full border border-border bg-background text-foreground hover:bg-accent data-[state=open]:bg-accent';
/** A round control that carries a label from wide screens up. */
export const controlPillClass =
  'relative h-11 shrink-0 gap-2 rounded-full border border-border bg-background px-4 text-foreground hover:bg-accent data-[state=open]:bg-accent';

/** Renders ControlButtons as labelled menu rows that close the menu on use. */
export function ControlMenuScope({
  onClose,
  children,
}: {
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <CloseCallOverflow.Provider value={onClose}>
      {children}
    </CloseCallOverflow.Provider>
  );
}

export function ControlButton({
  active,
  danger,
  attention,
  icon: Icon,
  label,
  detail,
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
  /** Trailing value shown on menu rows, such as the current layout. */
  detail?: string;
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
        closeOverflow
          ? 'relative h-auto min-h-11 w-full justify-start gap-3 whitespace-normal rounded-lg px-3 py-2 text-left'
          : controlButtonClass,
        danger &&
          !closeOverflow &&
          'border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/90',
        // Google Meet's convention: a lit control means the device is OFF.
        !danger &&
          active &&
          'border-transparent bg-foreground/15 hover:bg-foreground/20',
        attention &&
          'border-transparent bg-dynamic-orange/20 text-dynamic-orange ring-2 ring-dynamic-orange/60 hover:bg-dynamic-orange/30'
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
      {closeOverflow && detail ? (
        <span className="shrink-0 text-muted-foreground text-xs">{detail}</span>
      ) : null}
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
  /** Follow and Summon on wider screens, plus their phone menu rows. */
  navigation?: { follow: ReactNode; summon: ReactNode; menu?: ReactNode };
  /** Quiet label of the surface this person is on, left of the controls. */
  context?: ReactNode;
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
  const [moreOpen, setMoreOpen] = useState(false);
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
        <div className="hidden sm:block">{hand}</div>
        {liveActivity && <div className="hidden sm:block">{liveActivity}</div>}
        {hub && (
          <div className={activities ? undefined : 'hidden sm:block'}>
            {hub}
          </div>
        )}
        {navigation && (
          <>
            <div className="hidden sm:block">{navigation.follow}</div>
            <div className="hidden sm:block">{navigation.summon}</div>
          </>
        )}
        <Popover open={moreOpen} onOpenChange={setMoreOpen}>
          <Tooltip>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>
                <Button
                  aria-label={t(
                    liveActivity ? 'more_actions_activity' : 'more_actions'
                  )}
                  className={controlButtonClass}
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
            className="flex max-h-[min(32rem,70dvh)] w-72 max-w-[calc(100vw-1rem)] flex-col gap-1 overflow-y-auto p-2"
            side="top"
            sideOffset={8}
          >
            <CloseCallOverflow.Provider value={() => setMoreOpen(false)}>
              {!presenceOnly && <div className="sm:hidden">{shareScreen}</div>}
              <div className="sm:hidden">{hand}</div>
              {navigation?.menu && (
                <div className="flex flex-col gap-1 sm:hidden">
                  {navigation.menu}
                </div>
              )}
              {toolsMenu && !activities && (
                <div className="flex flex-col gap-1 sm:hidden">{toolsMenu}</div>
              )}
              {onToggleRecording ? (
                <ControlButton
                  active={recordingOn}
                  icon={recordingOn ? Square : CircleDot}
                  busy={recordingBusy}
                  attention={recordingOn}
                  label={
                    recordingOn ? t('stop_recording') : t('start_recording')
                  }
                  onClick={onToggleRecording}
                />
              ) : null}
              {extraControls}
              {onPresenceChange && (
                <Label className="flex min-h-11 items-center justify-between gap-2 border-t px-3 pt-1">
                  {t('presence_only')}
                  <Switch
                    checked={presenceOnly}
                    onCheckedChange={onPresenceChange}
                  />
                </Label>
              )}
            </CloseCallOverflow.Provider>
          </PopoverContent>
        </Popover>
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
      <div className="flex min-w-0 flex-1 items-center justify-end gap-1 sm:gap-2.5">
        <ControlButton
          active={activePanel === 'chat'}
          badge={unreadChat}
          icon={MessageSquare}
          label={t('chat')}
          onClick={() => onTogglePanel(activePanel === 'chat' ? null : 'chat')}
        />
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
