'use client';

import {
  CircleDot,
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
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import type { ComponentType, ReactNode } from 'react';

export type CallPanel = 'chat' | 'participants' | null;

function ControlButton({
  active,
  danger,
  attention,
  icon: Icon,
  label,
  onClick,
  badge,
  busy,
}: {
  active?: boolean;
  busy?: boolean;
  badge?: number;
  danger?: boolean;
  attention?: boolean;
  icon: ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          aria-label={label}
          aria-busy={busy}
          disabled={busy}
          aria-pressed={active}
          className={cn(
            'relative size-10 rounded-full sm:size-11',
            danger &&
              'bg-dynamic-red text-white hover:bg-dynamic-red/90 focus-visible:ring-dynamic-red',
            // Google Meet's convention: a lit control means the device is OFF.
            !danger && active && 'bg-foreground/15 hover:bg-foreground/20',
            attention &&
              'bg-dynamic-orange/20 text-dynamic-orange ring-2 ring-dynamic-orange/60 hover:bg-dynamic-orange/30'
          )}
          onClick={onClick}
          size="icon"
          type="button"
          variant={danger ? 'default' : 'ghost'}
        >
          {busy ? (
            <Loader2 className="size-5 animate-spin" />
          ) : (
            <Icon className="size-5" />
          )}
          {badge ? (
            <span className="absolute -top-0.5 -right-0.5 grid min-w-4 place-items-center rounded-full bg-dynamic-blue px-1 font-medium text-[0.6rem] text-white">
              {badge > 9 ? '9+' : badge}
            </span>
          ) : null}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function ControlBar({
  activePanel,
  extraControls,
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
}: {
  activePanel: CallPanel;
  extraControls?: ReactNode;
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
}) {
  const t = useTranslations('meet.call');

  return (
    <div className="flex flex-wrap items-center justify-center gap-1 border-t bg-background/95 px-2 py-3 backdrop-blur sm:gap-2 sm:px-4">
      <ControlButton
        active={!micOn}
        busy={busyDevices?.microphone}
        icon={micOn ? Mic : MicOff}
        label={micOn ? t('mute') : t('unmute')}
        onClick={onToggleMic}
      />
      <ControlButton
        active={!cameraOn}
        busy={busyDevices?.camera}
        icon={cameraOn ? Video : VideoOff}
        label={cameraOn ? t('camera_off') : t('camera_on')}
        onClick={onToggleCamera}
      />
      <ControlButton
        active={screenOn}
        busy={busyDevices?.screen}
        icon={MonitorUp}
        label={screenOn ? t('stop_sharing') : t('share_screen')}
        onClick={onToggleScreen}
      />
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
          onClick={recordingBusy ? () => undefined : onToggleRecording}
        />
      ) : null}

      {extraControls}
      <div className="mx-1 h-6 w-px bg-border" />

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

      <div className="mx-1 h-6 w-px bg-border" />

      <ControlButton
        danger
        icon={PhoneOff}
        label={t('leave')}
        onClick={onLeave}
      />
    </div>
  );
}
