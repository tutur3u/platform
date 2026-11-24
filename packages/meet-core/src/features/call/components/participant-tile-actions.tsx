'use client';
import {
  Expand,
  Maximize,
  Minimize,
  Pin,
  Volume2,
  VolumeX,
} from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import type { RefObject } from 'react';
import { usePhoneChrome } from '../phone/use-phone-chrome';

/**
 * The per-tile actions: mute for me, pin, and the focus view. On a phone they
 * appear when the tile is tapped, with 44 px targets, and stay reachable by
 * keyboard focus. They call the same handlers as on larger screens, so they
 * work while a follower's stage layout is locked.
 */
export function ParticipantTileActions({
  audio,
  controlsHidden,
  displayName,
  exitFocusRef,
  expanded,
  focusKey,
  focused,
  fullscreen,
  maximizeRef,
  onExpandedChange,
  onFocus,
  onSilence,
  shown,
  silenced,
  tileRef,
}: {
  /** The tile has a remote audio track to silence. */
  audio: boolean;
  controlsHidden: boolean;
  displayName: string;
  exitFocusRef: RefObject<HTMLButtonElement | null>;
  expanded: boolean;
  focusKey: string;
  focused?: boolean;
  fullscreen: boolean;
  maximizeRef: RefObject<HTMLButtonElement | null>;
  onExpandedChange: (expanded: boolean) => void;
  onFocus?: (key: string | null) => void;
  onSilence: () => void;
  /** Phones: the tile was tapped, so the actions are showing. */
  shown: boolean;
  silenced: boolean;
  tileRef: RefObject<HTMLDivElement | null>;
}) {
  const t = useTranslations('meet.call');
  const phone = usePhoneChrome();
  const button = phone ? 'size-11' : 'size-8 @max-[12rem]:size-6';
  return (
    <div
      className={cn(
        'absolute top-2 right-2 flex gap-1 rounded-lg @max-[12rem]:top-1 @max-[12rem]:right-1 @max-[12rem]:gap-0.5 @max-[12rem]:p-0.5 bg-background/80 p-1 opacity-100 backdrop-blur motion-safe:transition-opacity',
        expanded
          ? controlsHidden && 'pointer-events-none opacity-0'
          : phone
            ? cn(
                'focus-within:pointer-events-auto focus-within:opacity-100',
                shown ? 'opacity-100' : 'pointer-events-none opacity-0'
              )
            : 'sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 [@media(hover:none)]:opacity-100'
      )}
    >
      {audio && (
        <Button
          size="icon"
          variant={silenced ? 'secondary' : 'ghost'}
          className={button}
          aria-label={t(
            silenced ? 'audio_unmute_for_me' : 'audio_mute_for_me',
            { name: displayName }
          )}
          aria-pressed={silenced}
          onClick={onSilence}
        >
          {silenced ? (
            <VolumeX className="size-4" />
          ) : (
            <Volume2 className="size-4" />
          )}
        </Button>
      )}
      {onFocus && !expanded && (
        <Button
          size="icon"
          variant={focused ? 'secondary' : 'ghost'}
          className={button}
          aria-label={focused ? t('unfocus_feed') : t('focus_feed')}
          aria-pressed={focused}
          onClick={() => onFocus(focused ? null : focusKey)}
        >
          <Pin className="size-4" />
        </Button>
      )}
      {expanded && (
        <Button
          size="sm"
          variant="ghost"
          className="h-8 gap-1.5"
          aria-label={t(
            fullscreen ? 'exit_browser_fullscreen' : 'browser_fullscreen'
          )}
          title={t(
            fullscreen ? 'exit_browser_fullscreen' : 'browser_fullscreen'
          )}
          aria-pressed={fullscreen}
          onClick={() => {
            if (fullscreen) {
              void document.exitFullscreen().catch(() => undefined);
              return;
            }
            const tile = tileRef.current;
            if (!tile?.requestFullscreen) return;
            // A rejected request leaves the in-app focus view in place.
            void Promise.resolve(tile.requestFullscreen()).catch(
              () => undefined
            );
          }}
        >
          <Expand className="size-4" />
          <span className="@max-[20rem]:sr-only">
            {t(fullscreen ? 'exit_browser_fullscreen' : 'browser_fullscreen')}
          </span>
        </Button>
      )}
      {!(expanded && fullscreen) && (
        <Button
          ref={expanded ? exitFocusRef : maximizeRef}
          size={expanded ? 'sm' : 'icon'}
          variant="ghost"
          className={cn(expanded ? 'h-8 gap-1.5' : button)}
          aria-label={t(expanded ? 'exit_focus_view' : 'focus_view')}
          title={t(expanded ? 'exit_focus_view' : 'focus_view')}
          onClick={() => onExpandedChange(!expanded)}
        >
          {expanded ? (
            <>
              <Minimize className="size-4" />
              <span className="@max-[20rem]:sr-only">
                {t('exit_focus_view')}
              </span>
            </>
          ) : (
            <Maximize className="size-4" />
          )}
        </Button>
      )}
    </div>
  );
}
