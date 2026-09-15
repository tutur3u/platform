'use client';

import { AudioLines, Link2, Mic, MicOff } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useRef } from 'react';
import type { useSharedRoomAudio } from '../hooks/use-shared-room-audio';

/** A single audio status control, with actionable suggestions instead of banners. */
export function SharedAudioControl({
  audio,
  busy,
  onShare,
  onUseMicrophone,
}: {
  audio: ReturnType<typeof useSharedRoomAudio>;
  busy?: boolean;
  onShare: () => void;
  onUseMicrophone: () => void;
}) {
  const t = useTranslations('meet.call');
  const previousFocus = useRef<Element | null>(null);
  const paused = audio.mode === 'protected';
  const title = audio.shared
    ? t('audio_shared_title')
    : paused
      ? t(
          audio.reason === 'another-device'
            ? 'audio_other_device_title'
            : audio.reason === 'disconnected'
              ? 'audio_disconnected_title'
              : 'audio_overlap_title'
        )
      : t('audio_protection_title');
  const label = audio.shared
    ? t('audio_shared_title')
    : paused
      ? t('audio_mic_paused')
      : t('audio_protection_title');
  const Icon = audio.shared ? Link2 : paused ? MicOff : AudioLines;
  return (
    <Popover open={audio.open} onOpenChange={audio.setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label={t('audio_options_action')}
              className={cn(
                'relative size-9 shrink-0 rounded-full',
                audio.shared && 'bg-muted text-foreground',
                paused && 'bg-dynamic-orange/10 text-dynamic-orange'
              )}
            >
              <Icon className="size-4" aria-hidden="true" />
              {paused && (
                <span
                  aria-hidden="true"
                  className="absolute top-1 right-1 size-1.5 rounded-full bg-current"
                />
              )}
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
      <PopoverContent
        align="end"
        className="w-72 max-w-[calc(100vw-2rem)] space-y-3"
        onOpenAutoFocus={(event) => {
          previousFocus.current = document.activeElement;
          if (audio.automaticSuggestion) event.preventDefault();
        }}
        onCloseAutoFocus={(event) => {
          // An unsolicited suggestion must not move focus away from chat or notes.
          if (
            audio.automaticSuggestion &&
            document.activeElement === previousFocus.current
          )
            event.preventDefault();
        }}
      >
        <div className="space-y-1.5" role={paused ? 'status' : undefined}>
          <h2 className="font-semibold text-sm">{title}</h2>
          <p className="text-muted-foreground text-xs leading-relaxed">
            {audio.shared
              ? t('audio_shared_description')
              : paused
                ? t(
                    audio.reason === 'disconnected'
                      ? 'audio_disconnected_description'
                      : 'audio_paused_description'
                  )
                : t('audio_protection_description')}
          </p>
          {paused && audio.peerName && audio.reason !== 'disconnected' && (
            <p className="text-muted-foreground text-xs">
              {t('audio_nearby_prompt', { name: audio.peerName })}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-2">
          {!audio.shared && audio.reason !== 'disconnected' && (
            <Button type="button" size="sm" disabled={busy} onClick={onShare}>
              <Link2 className="size-4" aria-hidden="true" />
              {t('audio_share_action')}
            </Button>
          )}
          {audio.mode !== 'own' && (
            <Button
              type="button"
              size="sm"
              variant={audio.reason === 'disconnected' ? 'default' : 'outline'}
              disabled={busy}
              onClick={onUseMicrophone}
            >
              <Mic className="size-4" aria-hidden="true" />
              {t('audio_use_microphone')}
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
