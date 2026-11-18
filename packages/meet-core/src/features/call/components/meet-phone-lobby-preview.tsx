'use client';

import {
  CheckCircle2,
  Loader2,
  LogIn,
  Mic,
  MicOff,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Users,
  Video,
  VideoOff,
} from '@tuturuuu/icons';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { useEffect, useId, useRef } from 'react';
import { MiraMark } from './mira-mark';

export type PhoneTurnstileStatus =
  | 'verified'
  | 'pending'
  | 'verifying'
  | 'error';

export interface MeetPhoneLobbyPreviewProps {
  meetingName: string;
  participantCount: number;
  stream?: MediaStream | null;
  audioEnabled: boolean;
  videoEnabled: boolean;
  onToggleAudio: () => void;
  onToggleVideo: () => void;
  displayName: string;
  avatarUrl?: string;
  isGuest?: boolean;
  onDisplayNameChange?: (name: string) => void;
  turnstileStatus?: PhoneTurnstileStatus;
  onVerifyTurnstile?: () => void;
  turnstileSlot?: ReactNode;
  onSignIn?: () => void;
  signInHref?: string;
  onJoin?: () => void;
  joinDisabled?: boolean;
  isJoining?: boolean;
  waiting?: boolean;
  previewError?: string | null;
  micError?: string | null;
  className?: string;
}

/**
 * Screen A (Mockup 07, 390x844): Mobile Pre-Join / Guest Preview.
 * Uses Sorbet surface/radii tokens, Mira brand mark, 4:3 camera preview card,
 * compact 60px Turnstile verification row, and Sign in with Tuturuuu fallback.
 */
export function MeetPhoneLobbyPreview({
  meetingName,
  participantCount,
  stream = null,
  audioEnabled,
  videoEnabled,
  onToggleAudio,
  onToggleVideo,
  displayName,
  avatarUrl,
  isGuest = true,
  onDisplayNameChange,
  turnstileStatus = 'verified',
  onVerifyTurnstile,
  turnstileSlot,
  onSignIn,
  signInHref,
  onJoin,
  joinDisabled = false,
  isJoining = false,
  waiting = false,
  previewError = null,
  micError = null,
  className,
}: MeetPhoneLobbyPreviewProps) {
  const t = useTranslations('meet.call.phone');
  const videoRef = useRef<HTMLVideoElement>(null);
  const nameInputId = useId();

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (el.srcObject !== stream) {
      el.srcObject = videoEnabled ? stream : null;
    }
  }, [stream, videoEnabled]);

  const initial = displayName.trim().slice(0, 1).toUpperCase() || '?';
  const showVideo = Boolean(videoEnabled && stream);

  const turnstileLabel =
    turnstileStatus === 'verified'
      ? t('turnstile_verified')
      : turnstileStatus === 'verifying'
        ? t('turnstile_verifying')
        : turnstileStatus === 'error'
          ? t('turnstile_error')
          : t('turnstile_pending');

  return (
    <div
      data-testid="meet-phone-lobby-preview"
      className={cn(
        'ttr-sorbet-font mx-auto flex min-h-dvh w-full max-w-[390px] flex-col bg-background text-foreground',
        className
      )}
    >
      {/* Sticky translucent mobile top bar */}
      <header className="sticky top-0 z-20 flex items-center gap-2.5 border-b border-border/70 bg-background/85 px-3.5 py-2.5 backdrop-blur-md">
        <MiraMark size={30} data-testid="phone-lobby-mira-mark" />
        <h1 className="min-w-0 flex-1 truncate font-semibold text-foreground text-sm">
          {meetingName}
        </h1>
        <Badge
          variant="secondary"
          className="shrink-0 gap-1.5 rounded-full border border-border/70 px-2.5 py-1 font-medium text-xs"
        >
          <Users className="size-3.5" aria-hidden="true" />
          <span className="font-mono tabular-nums">
            {t('participant_pill', { count: participantCount })}
          </span>
        </Badge>
      </header>

      <main className="flex flex-1 flex-col gap-3.5 px-4 pt-4 pb-6">
        {/* 4:3 camera preview card with floating pill dock centered near bottom */}
        <section
          aria-label={t('camera_off_status')}
          className="relative aspect-4/3 w-full overflow-hidden rounded-[18px] border border-border/70 bg-card shadow-sm"
        >
          {showVideo ? (
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className="size-full -scale-x-100 object-cover"
            />
          ) : (
            <div className="flex size-full flex-col items-center justify-center gap-2.5 bg-muted/40 px-4 pb-14 text-center">
              <Avatar className="size-20 ring-2 ring-border/70">
                <AvatarImage
                  alt={displayName || t('self_label')}
                  src={avatarUrl}
                />
                <AvatarFallback className="font-semibold text-xl">
                  {initial}
                </AvatarFallback>
              </Avatar>
              <p className="text-muted-foreground text-xs">
                {previewError ?? t('camera_off_status')}
              </p>
            </div>
          )}

          {/* Floating pill dock centered near bottom */}
          <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full border border-border/70 bg-background/90 px-2.5 py-1.5 shadow-md backdrop-blur-md">
            <Button
              type="button"
              size="icon"
              variant={audioEnabled ? 'secondary' : 'default'}
              aria-label={
                audioEnabled ? t('mic_mute_label') : t('mic_unmute_label')
              }
              aria-pressed={!audioEnabled}
              onClick={onToggleAudio}
              className={cn(
                'size-11 rounded-full',
                !audioEnabled &&
                  'bg-dynamic-red text-white hover:bg-dynamic-red/90'
              )}
            >
              {audioEnabled ? (
                <Mic className="size-5" aria-hidden="true" />
              ) : (
                <MicOff className="size-5" aria-hidden="true" />
              )}
            </Button>

            <Button
              type="button"
              size="icon"
              variant={videoEnabled ? 'secondary' : 'default'}
              aria-label={
                videoEnabled ? t('camera_off_label') : t('camera_on_label')
              }
              aria-pressed={!videoEnabled}
              onClick={onToggleVideo}
              className={cn(
                'size-11 rounded-full',
                !videoEnabled &&
                  'bg-dynamic-red text-white hover:bg-dynamic-red/90'
              )}
            >
              {videoEnabled ? (
                <Video className="size-5" aria-hidden="true" />
              ) : (
                <VideoOff className="size-5" aria-hidden="true" />
              )}
            </Button>
          </div>
        </section>

        {micError && !audioEnabled && (
          <p role="status" className="text-muted-foreground text-xs">
            {micError}
          </p>
        )}

        {isGuest && (
          <div className="space-y-1.5">
            <Label htmlFor={nameInputId} className="font-medium text-xs">
              {t('your_name_label')}
            </Label>
            <Input
              id={nameInputId}
              value={displayName}
              onChange={(event) => onDisplayNameChange?.(event.target.value)}
              placeholder={t('your_name_placeholder')}
              autoComplete="name"
              className="min-h-11 rounded-xl text-base"
            />
          </div>
        )}

        {/* Compact Turnstile verification row (60px height) */}
        <div
          data-testid="phone-turnstile-row"
          className="flex h-[60px] min-h-[60px] items-center justify-between gap-2.5 rounded-[18px] border border-border/70 bg-card px-3.5 shadow-xs"
        >
          <div className="flex min-w-0 items-center gap-2.5">
            {turnstileStatus === 'verified' ? (
              <span
                data-testid="turnstile-verified-badge"
                className="grid size-8 shrink-0 place-items-center rounded-full bg-dynamic-green/15 text-dynamic-green"
              >
                <CheckCircle2 className="size-4" aria-hidden="true" />
              </span>
            ) : turnstileStatus === 'verifying' ? (
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-dynamic-purple/15 text-dynamic-purple">
                <Loader2
                  className="size-4 animate-spin motion-reduce:animate-none"
                  aria-hidden="true"
                />
              </span>
            ) : turnstileStatus === 'error' ? (
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-dynamic-red/15 text-dynamic-red">
                <ShieldAlert className="size-4" aria-hidden="true" />
              </span>
            ) : (
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-secondary text-foreground">
                <Shield className="size-4" aria-hidden="true" />
              </span>
            )}

            {onVerifyTurnstile && turnstileStatus !== 'verified' ? (
              <button
                type="button"
                onClick={onVerifyTurnstile}
                className="min-w-0 truncate text-left font-medium text-foreground text-xs underline-offset-2 hover:underline"
              >
                {turnstileLabel}
              </button>
            ) : (
              <span
                role="status"
                className="min-w-0 truncate font-medium text-foreground text-xs"
              >
                {turnstileLabel}
              </span>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {turnstileSlot}
            <Badge
              variant="outline"
              className="gap-1 rounded-full border-border/70 bg-secondary/70 px-2.5 py-1 font-mono text-[11px] text-foreground"
            >
              <ShieldCheck
                className="size-3.5 text-dynamic-green"
                aria-hidden="true"
              />
              {t('turnstile_badge')}
            </Badge>
          </div>
        </div>

        <div className="mt-auto space-y-2.5 pt-2">
          {onJoin && (
            <Button
              type="button"
              size="lg"
              disabled={
                joinDisabled ||
                isJoining ||
                waiting ||
                (isGuest && !displayName.trim())
              }
              onClick={onJoin}
              className="min-h-[46px] w-full rounded-full font-semibold"
            >
              {isJoining && !waiting && (
                <Loader2
                  className="size-4 animate-spin motion-reduce:animate-none"
                  aria-hidden="true"
                />
              )}
              {waiting
                ? t('waiting_host')
                : isJoining
                  ? t('joining_call')
                  : t('join_call')}
            </Button>
          )}

          {signInHref ? (
            <Button
              asChild
              variant="outline"
              className="min-h-11 w-full rounded-full font-medium"
            >
              <a href={signInHref}>
                <LogIn className="size-4" aria-hidden="true" />
                {t('sign_in_tuturuuu')}
              </a>
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              onClick={onSignIn}
              className="min-h-11 w-full rounded-full font-medium"
            >
              <LogIn className="size-4" aria-hidden="true" />
              {t('sign_in_tuturuuu')}
            </Button>
          )}
        </div>
      </main>
    </div>
  );
}
