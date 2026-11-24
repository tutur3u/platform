'use client';
import { Globe, VenetianMask } from '@tuturuuu/icons';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import {
  meetParticipantIdentity,
  type MeetParticipantIdentityFlags,
} from '../lib/participant-identity';

/**
 * Compact icon marker for anonymous guests and signed-in people from outside
 * the workspace. Members render nothing. The tooltip opens on hover, keyboard
 * focus and tap; the trigger carries the same text as its accessible name.
 */
export function ParticipantIdentityBadge({
  className,
  participant,
}: {
  className?: string;
  participant: MeetParticipantIdentityFlags;
}) {
  const t = useTranslations('meet.call.participant_identity');
  const [open, setOpen] = useState(false);
  // Radix closes an open tooltip on pointerdown, before click runs. Remember
  // whether this press started open so a second tap closes instead of reopening.
  const pressedWhileOpen = useRef(false);
  const identity = meetParticipantIdentity(participant);
  if (identity === 'member') return null;
  const label = identity === 'guest' ? t('guest') : t('external');
  const Icon = identity === 'guest' ? VenetianMask : Globe;
  return (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger asChild>
        <button
          aria-label={label}
          className={cn(
            'inline-grid size-5 shrink-0 place-items-center rounded-full border align-middle outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:size-6',
            identity === 'guest'
              ? 'border-dynamic-orange/40 bg-dynamic-orange/15 text-dynamic-orange'
              : 'border-dynamic-blue/40 bg-dynamic-blue/15 text-dynamic-blue',
            className
          )}
          data-identity={identity}
          // Radix closes a tooltip on click; a tap toggles it here instead so
          // touch screens without hover can read the label.
          onPointerDown={() => {
            pressedWhileOpen.current = open;
          }}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            const wasOpen = pressedWhileOpen.current || open;
            pressedWhileOpen.current = false;
            setOpen(!wasOpen);
          }}
          type="button"
        >
          <Icon aria-hidden="true" className="size-3" />
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
