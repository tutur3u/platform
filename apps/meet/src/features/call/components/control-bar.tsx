'use client';

import {
  Circle,
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
import type { ComponentType } from 'react';

export type CallPanel = 'chat' | 'participants' | null;

function ControlButton({
  active,
  danger,
  icon: Icon,
  label,
  onClick,
  badge,
}: {
  active?: boolean;
  badge?: number;
  danger?: boolean;
  icon: ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          aria-label={label}
          aria-pressed={active}
          className={cn(
            'relative size-11 rounded-full',
            danger &&
              'bg-dynamic-red text-white hover:bg-dynamic-red/90 focus-visible:ring-dynamic-red',
            // Google Meet's convention: a lit control means the device is OFF.
            !danger && active && 'bg-foreground/15 hover:bg-foreground/20'
          )}
          onClick={onClick}
          size="icon"
          type="button"
          variant={danger ? 'default' : 'ghost'}
        >
          <Icon className="size-5" />
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
    <div className="flex items-center justify-center gap-2 border-t bg-background/95 px-4 py-3 backdrop-blur">
      <ControlButton
        active={!micOn}
        icon={micOn ? Mic : MicOff}
        label={micOn ? t('mute') : t('unmute')}
        onClick={onToggleMic}
      />
      <ControlButton
        active={!cameraOn}
        icon={cameraOn ? Video : VideoOff}
        label={cameraOn ? t('camera_off') : t('camera_on')}
        onClick={onToggleCamera}
      />
      <ControlButton
        active={screenOn}
        icon={MonitorUp}
        label={screenOn ? t('stop_sharing') : t('share_screen')}
        onClick={onToggleScreen}
      />
      <ControlButton
        active={handRaised}
        icon={Hand}
        label={handRaised ? t('lower_hand') : t('raise_hand')}
        onClick={onToggleHand}
      />

      {onToggleRecording ? (
        <ControlButton
          active={recordingOn}
          icon={Circle}
          label={recordingOn ? t('stop_recording') : t('start_recording')}
          onClick={recordingBusy ? () => undefined : onToggleRecording}
        />
      ) : null}

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
