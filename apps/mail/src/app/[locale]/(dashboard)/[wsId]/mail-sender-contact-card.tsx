'use client';

import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { MailParticipantAvatar } from './mail-participant-avatar';
import {
  MAIL_PROFILE_HOVER_DELAY_MS,
  useMailPersonProfile,
} from './mail-person-name';
import { MailProfileCard } from './mail-profile-card';
import {
  MailProfileHoldProvider,
  useMailProfileHoldState,
} from './mail-profile-context';

type OpenedBy = 'hover' | 'press';

/**
 * A participant's avatar and resolved name. The profile card opens after a
 * 300 ms hover, on click, or on Enter; Escape closes it and returns focus to
 * the name. It stays open while the card holds it (a dirty form or an open
 * dialog).
 */
export function MailSenderContactCard({
  workspaceId,
  address,
  name,
  variant = 'sender',
  unknownActions,
}: {
  workspaceId?: string;
  address: string;
  name: string | null;
  variant?: 'sender' | 'inline';
  unknownActions?: ReactNode;
}) {
  const t = useTranslations('mail.profile');
  const profile = useMailPersonProfile(workspaceId, address, name);
  const [open, setOpen] = useState(false);
  const hold = useMailProfileHoldState();
  const openedBy = useRef<OpenedBy>('press');
  const trigger = useRef<HTMLButtonElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearTimers() {
    if (openTimer.current) clearTimeout(openTimer.current);
    if (closeTimer.current) clearTimeout(closeTimer.current);
    openTimer.current = null;
    closeTimer.current = null;
  }
  function openOnHover() {
    clearTimers();
    if (open) return;
    openTimer.current = setTimeout(() => {
      openedBy.current = 'hover';
      setOpen(true);
    }, MAIL_PROFILE_HOVER_DELAY_MS);
  }
  function closeAfterPointerLeave() {
    clearTimers();
    if (!open || hold.held || openedBy.current !== 'hover') return;
    closeTimer.current = setTimeout(() => {
      if (
        !trigger.current?.contains(document.activeElement) &&
        !content.current?.contains(document.activeElement)
      )
        setOpen(false);
    }, 150);
  }
  function openOnPress() {
    clearTimers();
    openedBy.current = 'press';
    if (open) content.current?.focus();
    else setOpen(true);
  }
  useEffect(() => clearTimers, []);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        clearTimers();
        if (!next && hold.held) return;
        setOpen(next);
      }}
    >
      <PopoverTrigger asChild>
        <button
          ref={trigger}
          type="button"
          aria-label={t('show', { name: profile.label })}
          className={cn(
            'flex min-w-0 items-center gap-1.5 rounded-full text-left outline-ring/50 transition-colors hover:bg-muted/60 focus-visible:outline-2',
            variant === 'sender' ? 'max-w-full py-0.5 pr-2' : 'max-w-56 pr-1.5'
          )}
          onPointerEnter={(event) => {
            if (event.pointerType === 'mouse') openOnHover();
          }}
          onPointerLeave={closeAfterPointerLeave}
          onClick={(event) => {
            event.preventDefault();
            openOnPress();
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              openOnPress();
            }
          }}
        >
          <MailParticipantAvatar
            workspaceId={workspaceId}
            address={address}
            name={name}
          />
          <span
            className={cn(
              'truncate',
              variant === 'sender'
                ? 'font-semibold text-foreground text-sm'
                : 'text-foreground/80 text-xs'
            )}
          >
            {profile.label}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        ref={content}
        align="start"
        tabIndex={-1}
        aria-label={t('card', { name: profile.label })}
        className="max-h-[min(30rem,var(--radix-popover-content-available-height))] w-[min(21.25rem,calc(100vw-2rem))] overflow-y-auto rounded-2xl p-0 outline-none"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          if (openedBy.current === 'press') content.current?.focus();
        }}
        onCloseAutoFocus={(event) => {
          if (openedBy.current === 'hover') event.preventDefault();
        }}
        onPointerEnter={clearTimers}
        onPointerLeave={closeAfterPointerLeave}
      >
        <MailProfileHoldProvider report={hold.report}>
          <MailProfileCard
            workspaceId={workspaceId}
            address={address}
            name={name}
            state={profile.state}
            unknownActions={unknownActions}
          />
        </MailProfileHoldProvider>
      </PopoverContent>
    </Popover>
  );
}
