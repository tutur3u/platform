'use client';

import { Drawer, DrawerContent, DrawerTitle } from '@tuturuuu/ui/drawer';
import { useIsMobile } from '@tuturuuu/ui/hooks/use-mobile';
import { Sheet, SheetContent, SheetTitle } from '@tuturuuu/ui/sheet';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { type ReactNode, useRef, useState } from 'react';
import { MailParticipantAvatar } from './mail-participant-avatar';
import { useMailPersonProfile } from './mail-person-name';
import { MailProfileCard } from './mail-profile-card';
import {
  MailProfileHoldProvider,
  useMailProfileHoldState,
} from './mail-profile-context';

/**
 * A participant's avatar and resolved name. Click, Enter, Space or ArrowDown
 * opens the profile in a side sheet (a bottom drawer on mobile); hovering
 * never opens it. Escape or the overlay closes it and focus returns to the
 * name. It stays open while the card holds it (a dirty form or an open
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
  const isMobile = useIsMobile();
  const trigger = useRef<HTMLButtonElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const title = t('card', { name: profile.label });

  function changeOpen(next: boolean) {
    if (!next && hold.held) return;
    setOpen(next);
  }
  function focusContent(event: Event) {
    event.preventDefault();
    content.current?.focus();
  }
  function returnFocus(event: Event) {
    event.preventDefault();
    trigger.current?.focus();
  }

  const card = (
    <MailProfileHoldProvider report={hold.report}>
      <MailProfileCard
        workspaceId={workspaceId}
        address={address}
        name={name}
        state={profile.state}
        unknownActions={unknownActions}
      />
    </MailProfileHoldProvider>
  );

  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-label={t('show', { name: profile.label })}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={cn(
          'flex min-w-0 items-center gap-1.5 rounded-full text-left outline-ring/50 transition-colors hover:bg-muted/60 focus-visible:outline-2',
          variant === 'sender' ? 'max-w-full py-0.5 pr-2' : 'max-w-56 pr-1.5'
        )}
        onClick={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setOpen(true);
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
      {isMobile ? (
        <Drawer open={open} onOpenChange={changeOpen}>
          <DrawerContent
            ref={content}
            tabIndex={-1}
            aria-describedby={undefined}
            className="max-h-[85dvh] outline-none"
            onOpenAutoFocus={focusContent}
            onCloseAutoFocus={returnFocus}
          >
            <DrawerTitle className="sr-only">{title}</DrawerTitle>
            <div className="min-h-0 overflow-y-auto pb-[env(safe-area-inset-bottom)]">
              {card}
            </div>
          </DrawerContent>
        </Drawer>
      ) : (
        <Sheet open={open} onOpenChange={changeOpen}>
          <SheetContent
            ref={content}
            side="right"
            tabIndex={-1}
            aria-describedby={undefined}
            className="w-[min(24rem,100vw)] gap-0 overflow-y-auto pt-10 outline-none sm:max-w-sm"
            onOpenAutoFocus={focusContent}
            onCloseAutoFocus={returnFocus}
          >
            <SheetTitle className="sr-only">{title}</SheetTitle>
            {card}
          </SheetContent>
        </Sheet>
      )}
    </>
  );
}
