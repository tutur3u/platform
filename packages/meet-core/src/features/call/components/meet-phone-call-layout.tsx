'use client';

import {
  Hand,
  Lock,
  MessageSquare,
  Mic,
  MicOff,
  MoreHorizontal,
  PhoneOff,
  Radio,
  Video,
  VideoOff,
} from '@tuturuuu/icons';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useEffect, useId, useRef, useState } from 'react';
import { MiraAdultNotice } from '../../live-assistant/mira-adult-notice';
import { MiraMark } from './mira-mark';
import { MiraAvatar } from './mira-profile';

export interface PhoneParticipantInfo {
  userId: string;
  displayName: string;
  avatarUrl?: string;
  isHost?: boolean;
  isSpeaking?: boolean;
  micOn?: boolean;
  videoOn?: boolean;
  handRaised?: boolean;
  stream?: MediaStream | null;
}

export type PhoneMiraStatus = 'speaking' | 'typing' | 'idle';
export type PhoneMiraMode = 'live' | 'chat';

export interface MeetPhoneCallLayoutProps {
  spotlight: PhoneParticipantInfo;
  self: PhoneParticipantInfo;
  nextParticipant?: PhoneParticipantInfo | null;
  overflowCount?: number;
  miraStatus?: PhoneMiraStatus;
  miraMode?: PhoneMiraMode;
  miraCaption?: string | null;
  micOn: boolean;
  cameraOn: boolean;
  cameraLocked?: boolean;
  handRaised?: boolean;
  onToggleMic: () => void;
  onToggleCamera: () => void;
  onToggleHand: () => void;
  onOpenMira?: () => void;
  onOpenMore?: () => void;
  onOpenParticipants?: () => void;
  onLeave: () => void;
  className?: string;
}

function tileInitial(name: string) {
  return name.trim().slice(0, 1).toUpperCase() || '?';
}

function StreamVideo({
  stream,
  mirrored = false,
  className,
}: {
  stream?: MediaStream | null;
  mirrored?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.srcObject !== stream) {
      el.srcObject = stream ?? null;
    }
  }, [stream]);

  return (
    <video
      ref={ref}
      autoPlay
      muted
      playsInline
      className={cn(
        'size-full object-cover',
        mirrored && '-scale-x-100',
        className
      )}
    />
  );
}

/**
 * Screen B (Mockup 07, 390x844): Mobile Active Call Stage & Floating Dock.
 * Features a >=360px spotlight tile, 104px Self-PiP corner tile, Mira floating
 * caption overlay, status badge strip, 3-tile secondary row (Mira, next
 * participant, +N overflow), and a sticky 46px circular control dock.
 */
export function MeetPhoneCallLayout({
  spotlight,
  self,
  nextParticipant = null,
  overflowCount = 0,
  miraStatus = 'idle',
  miraMode = 'live',
  miraCaption = null,
  micOn,
  cameraOn,
  cameraLocked = false,
  handRaised = false,
  onToggleMic,
  onToggleCamera,
  onToggleHand,
  onOpenMira,
  onOpenMore,
  onOpenParticipants,
  onLeave,
  className,
}: MeetPhoneCallLayoutProps) {
  const t = useTranslations('meet.call.phone');
  const [lockedTooltipOpen, setLockedTooltipOpen] = useState(false);
  const lockedTooltipId = useId();
  const adultNoticeId = useId();
  const miraIsSpeaking = miraStatus === 'speaking';

  useEffect(() => {
    if (!cameraLocked) setLockedTooltipOpen(false);
  }, [cameraLocked]);

  const showSpotlightVideo = Boolean(spotlight.videoOn && spotlight.stream);
  const showSelfVideo = Boolean(self.videoOn && self.stream);

  return (
    <div
      data-testid="meet-phone-call-layout"
      className={cn(
        'ttr-sorbet-font mx-auto flex min-h-dvh w-full max-w-[390px] flex-col gap-3 bg-background px-3 pt-3 pb-4 text-foreground',
        className
      )}
    >
      {/* Active speaker spotlight tile (min-h-[360px]) */}
      <section
        aria-label={`${t('active_speaker_label')}: ${spotlight.displayName}`}
        data-testid="phone-spotlight-tile"
        className={cn(
          'relative flex min-h-[360px] flex-1 flex-col justify-between overflow-hidden rounded-[24px] border bg-card shadow-sm',
          spotlight.isSpeaking
            ? 'border-dynamic-green ring-2 ring-dynamic-green'
            : 'border-border/70'
        )}
      >
        {showSpotlightVideo ? (
          <StreamVideo
            stream={spotlight.stream}
            className="absolute inset-0 size-full"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-muted/35">
            <Avatar className="size-24 ring-2 ring-border/70">
              <AvatarImage
                alt={spotlight.displayName}
                src={spotlight.avatarUrl}
              />
              <AvatarFallback className="font-semibold text-2xl">
                {tileInitial(spotlight.displayName)}
              </AvatarFallback>
            </Avatar>
          </div>
        )}

        {/* Top row: Host pill + speaker name on left, 104px Self-PiP on right */}
        <div className="relative z-10 flex items-start justify-between gap-2 p-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {spotlight.isHost && (
              <Badge
                data-testid="phone-spotlight-host-pill"
                className="rounded-full bg-background/90 px-2.5 py-0.5 font-semibold text-foreground text-xs shadow-xs backdrop-blur-sm"
                variant="secondary"
              >
                {t('host_badge')}
              </Badge>
            )}
            <span className="inline-flex items-center gap-1.5 rounded-full bg-background/85 px-2.5 py-1 font-semibold text-foreground text-xs shadow-xs backdrop-blur-sm">
              {spotlight.micOn === false && (
                <MicOff
                  className="size-3.5 text-dynamic-red"
                  aria-hidden="true"
                />
              )}
              <span className="max-w-[140px] truncate">
                {spotlight.displayName}
              </span>
            </span>
          </div>

          {/* 104px Self-PiP corner tile */}
          <div
            data-testid="phone-self-pip"
            aria-label={t('self_label')}
            className="relative w-[104px] shrink-0 overflow-hidden rounded-[18px] border border-border/80 bg-card shadow-md aspect-4/5"
          >
            {showSelfVideo ? (
              <StreamVideo stream={self.stream} mirrored />
            ) : (
              <div className="flex size-full items-center justify-center bg-secondary">
                <Avatar className="size-11">
                  <AvatarImage alt={self.displayName} src={self.avatarUrl} />
                  <AvatarFallback className="font-semibold text-sm">
                    {tileInitial(self.displayName)}
                  </AvatarFallback>
                </Avatar>
              </div>
            )}
            <div className="absolute inset-x-1.5 bottom-1.5 flex items-center justify-between gap-1 rounded-full bg-background/85 px-2 py-0.5 text-[11px] font-medium backdrop-blur-sm">
              <span className="truncate">{t('self_label')}</span>
              {!micOn && (
                <MicOff
                  className="size-3 shrink-0 text-dynamic-red"
                  aria-hidden="true"
                />
              )}
            </div>
          </div>
        </div>

        {/* Mira floating live caption overlay */}
        {miraCaption ? (
          <div
            role="status"
            aria-live="polite"
            data-testid="phone-mira-caption"
            className="relative z-10 mx-3 mb-3 flex items-start gap-2 rounded-[18px] border border-dynamic-purple/30 bg-background/90 px-3 py-2 text-xs text-foreground shadow-sm backdrop-blur-md"
          >
            <MiraMark size={18} className="mt-0.5" />
            <p className="min-w-0 leading-relaxed">
              <span className="mr-1 font-semibold text-dynamic-purple">
                {t('mira_caption_prefix')}
              </span>
              <span>{miraCaption}</span>
            </p>
          </div>
        ) : (
          <div aria-hidden="true" />
        )}
      </section>

      {/* Status badge strip */}
      {miraStatus !== 'idle' && (
        <div
          role="status"
          aria-live="polite"
          data-testid="phone-mira-status-strip"
          style={{ backgroundColor: 'var(--bg-purple)' }}
          className="flex items-center justify-center gap-2 rounded-full border border-dynamic-purple/30 px-3.5 py-1.5 text-xs font-medium text-foreground"
        >
          <span
            aria-hidden="true"
            className="size-2 rounded-full bg-dynamic-purple motion-safe:animate-pulse motion-reduce:animate-none"
          />
          {miraIsSpeaking ? (
            <>
              <Radio
                className="size-3.5 text-dynamic-purple"
                aria-hidden="true"
              />
              <span>{t('mira_speaking')}</span>
            </>
          ) : (
            <>
              <MessageSquare
                className="size-3.5 text-dynamic-purple"
                aria-hidden="true"
              />
              <span>{t('mira_typing_chat')}</span>
            </>
          )}
        </div>
      )}

      {/* 3-tile secondary row: Mira tile, next participant tile, +N overflow */}
      <div data-testid="phone-secondary-row" className="grid grid-cols-3 gap-2">
        {/* Tile 1: Mira */}
        <button
          type="button"
          onClick={onOpenMira}
          aria-label={t('mira_open_label')}
          aria-describedby={adultNoticeId}
          data-testid="phone-mira-tile"
          style={{ backgroundColor: 'var(--mira-bg)' }}
          className={cn(
            'relative flex min-h-[96px] flex-col items-center justify-center gap-1.5 rounded-[18px] border border-dynamic-purple/30 p-2 text-center transition-shadow focus-visible:outline-2 focus-visible:outline-ring motion-reduce:transition-none',
            miraIsSpeaking && 'mira-speaking motion-reduce:animate-none'
          )}
        >
          <Badge
            variant="secondary"
            style={{ backgroundColor: 'var(--bg-purple)' }}
            className="absolute top-1.5 left-1.5 gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold text-dynamic-purple"
          >
            {miraMode === 'live' ? t('mira_badge_live') : t('mira_badge_chat')}
          </Badge>
          <div className="mt-3 rounded-full bg-background/80 p-1.5">
            <MiraAvatar size={26} />
          </div>
          <span className="flex items-center gap-1 font-semibold text-xs text-foreground">
            Mira <MiraAdultNotice variant="compact" id={adultNoticeId} />
          </span>
        </button>

        {/* Tile 2: Next participant with optional hand-raised badge */}
        {nextParticipant ? (
          <div
            data-testid="phone-next-participant-tile"
            className="relative flex min-h-[96px] flex-col items-center justify-center gap-1.5 overflow-hidden rounded-[18px] border border-border/70 bg-card p-2 text-center"
          >
            {nextParticipant.handRaised && (
              <span
                data-testid="phone-next-hand-badge"
                aria-label={t('hand_raise_action')}
                className="absolute top-1.5 right-1.5 grid size-6 place-items-center rounded-full bg-dynamic-orange/15 text-dynamic-orange"
              >
                <Hand className="size-3.5" aria-hidden="true" />
              </span>
            )}
            <Avatar className="size-9">
              <AvatarImage
                alt={nextParticipant.displayName}
                src={nextParticipant.avatarUrl}
              />
              <AvatarFallback className="font-semibold text-xs">
                {tileInitial(nextParticipant.displayName)}
              </AvatarFallback>
            </Avatar>
            <div className="flex max-w-full items-center gap-1 px-1">
              {nextParticipant.micOn === false && (
                <MicOff
                  className="size-3 shrink-0 text-dynamic-red"
                  aria-hidden="true"
                />
              )}
              <span className="truncate font-medium text-xs text-foreground">
                {nextParticipant.displayName}
              </span>
            </div>
          </div>
        ) : (
          <div
            data-testid="phone-next-participant-empty"
            className="flex min-h-[96px] items-center justify-center rounded-[18px] border border-dashed border-border/70 bg-muted/30 p-2 text-muted-foreground text-xs"
          >
            {t('self_label')}
          </div>
        )}

        {/* Tile 3: +N overflow count tile */}
        <button
          type="button"
          onClick={onOpenParticipants}
          aria-label={t('overflow_participants_label', {
            count: overflowCount,
          })}
          data-testid="phone-overflow-tile"
          className="flex min-h-[96px] flex-col items-center justify-center gap-1 rounded-[18px] border border-border/70 bg-card p-2 text-center hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
        >
          <span className="font-mono font-bold text-lg text-foreground tabular-nums">
            {t('overflow_participants', { count: overflowCount })}
          </span>
          <span className="text-[11px] text-muted-foreground">
            {t('overflow_participants_label', { count: overflowCount })}
          </span>
        </button>
      </div>

      {/* Sticky floating bottom dock */}
      <div className="sticky bottom-3 z-20 mx-auto w-full max-w-[366px]">
        {cameraLocked && lockedTooltipOpen && (
          <div
            id={lockedTooltipId}
            role="tooltip"
            data-testid="phone-camera-locked-tooltip"
            className="mb-2 flex items-center justify-between gap-2 rounded-2xl border border-border bg-popover px-3.5 py-2.5 text-popover-foreground text-xs shadow-lg"
          >
            <div className="min-w-0 space-y-0.5">
              <p className="font-semibold text-foreground">
                {t('camera_locked_title')}
              </p>
              <p className="text-muted-foreground">
                {t('camera_locked_action')}
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => {
                setLockedTooltipOpen(false);
                onToggleHand();
              }}
              className="h-8 shrink-0 rounded-full px-3 text-xs"
            >
              <Hand className="size-3.5" aria-hidden="true" />
              {t('hand_raise_action')}
            </Button>
          </div>
        )}

        <nav
          aria-label={t('more_controls')}
          className="flex items-center justify-between gap-1 rounded-full border border-border/80 bg-background/95 p-1.5 shadow-lg backdrop-blur-md"
        >
          {/* Mic */}
          <Button
            type="button"
            size="icon"
            variant={micOn ? 'secondary' : 'default'}
            aria-label={micOn ? t('mic_mute_label') : t('mic_unmute_label')}
            aria-pressed={!micOn}
            onClick={onToggleMic}
            className={cn(
              'size-[46px] shrink-0 rounded-full',
              !micOn && 'bg-dynamic-red text-white hover:bg-dynamic-red/90'
            )}
          >
            {micOn ? (
              <Mic className="size-5" aria-hidden="true" />
            ) : (
              <MicOff className="size-5" aria-hidden="true" />
            )}
          </Button>

          {/* Camera (with locked state + lock badge + accessible tooltip) */}
          <div className="relative shrink-0">
            <Button
              type="button"
              size="icon"
              variant={cameraOn && !cameraLocked ? 'secondary' : 'default'}
              aria-label={
                cameraLocked
                  ? `${t('camera_locked_title')}. ${t('camera_locked_action')}`
                  : cameraOn
                    ? t('camera_off_label')
                    : t('camera_on_label')
              }
              aria-pressed={!cameraOn}
              aria-disabled={cameraLocked || undefined}
              aria-describedby={
                cameraLocked && lockedTooltipOpen ? lockedTooltipId : undefined
              }
              data-testid="phone-camera-button"
              onClick={() => {
                if (cameraLocked) {
                  setLockedTooltipOpen((open) => !open);
                  return;
                }
                onToggleCamera();
              }}
              onMouseEnter={() => {
                if (cameraLocked) setLockedTooltipOpen(true);
              }}
              onFocus={() => {
                if (cameraLocked) setLockedTooltipOpen(true);
              }}
              onBlur={(event) => {
                if (
                  cameraLocked &&
                  !event.currentTarget.parentElement?.contains(
                    event.relatedTarget as Node | null
                  )
                ) {
                  setLockedTooltipOpen(false);
                }
              }}
              className={cn(
                'size-[46px] rounded-full',
                cameraLocked
                  ? 'bg-muted text-muted-foreground opacity-90 hover:bg-muted'
                  : !cameraOn &&
                      'bg-dynamic-red text-white hover:bg-dynamic-red/90'
              )}
            >
              {cameraOn && !cameraLocked ? (
                <Video className="size-5" aria-hidden="true" />
              ) : (
                <VideoOff className="size-5" aria-hidden="true" />
              )}
            </Button>
            {cameraLocked && (
              <span
                data-testid="phone-camera-lock-badge"
                aria-hidden="true"
                className="pointer-events-none absolute -top-0.5 -right-0.5 grid size-5 place-items-center rounded-full border border-background bg-dynamic-orange text-white shadow-xs"
              >
                <Lock className="size-2.5" />
              </span>
            )}
          </div>

          {/* Raise Hand */}
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label={
              handRaised ? t('hand_lower_action') : t('hand_raise_action')
            }
            aria-pressed={handRaised}
            onClick={onToggleHand}
            className={cn(
              'size-[46px] shrink-0 rounded-full',
              handRaised
                ? 'bg-dynamic-orange/20 text-dynamic-orange ring-2 ring-dynamic-orange/60 hover:bg-dynamic-orange/30'
                : 'bg-secondary text-secondary-foreground'
            )}
          >
            <Hand className="size-5" aria-hidden="true" />
          </Button>

          {/* Mira button */}
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label={t('mira_open_label')}
            aria-describedby={adultNoticeId}
            onClick={onOpenMira}
            style={{ backgroundColor: 'var(--bg-purple)' }}
            className="size-[46px] shrink-0 rounded-full border border-dynamic-purple/30"
          >
            <MiraMark size={24} />
          </Button>

          {/* More */}
          <Button
            type="button"
            size="icon"
            variant="secondary"
            aria-label={t('more_controls')}
            onClick={onOpenMore}
            className="size-[46px] shrink-0 rounded-full"
          >
            <MoreHorizontal className="size-5" aria-hidden="true" />
          </Button>

          {/* Leave pill */}
          <Button
            type="button"
            onClick={onLeave}
            aria-label={t('leave_call')}
            className="h-[46px] shrink-0 gap-1.5 rounded-full bg-dynamic-red px-3.5 font-semibold text-white text-xs hover:bg-dynamic-red/90"
          >
            <PhoneOff className="size-4" aria-hidden="true" />
            <span>{t('leave_call')}</span>
          </Button>
        </nav>
      </div>
    </div>
  );
}
