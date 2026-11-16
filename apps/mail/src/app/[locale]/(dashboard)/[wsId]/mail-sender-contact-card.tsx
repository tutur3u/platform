'use client';

import { useQuery } from '@tanstack/react-query';
import { UserRound } from '@tuturuuu/icons';
import { searchWorkspacePeople } from '@tuturuuu/internal-api/people';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Button } from '@tuturuuu/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { resolveInternalAppUrl } from '@tuturuuu/utils/app-url';
import { getLocalInternalAppUrl } from '@tuturuuu/utils/internal-domains';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { MailSenderContactCreate } from './mail-sender-contact-create';

const contactsOrigin = resolveInternalAppUrl({
  appName: 'contacts',
  candidates: [process.env.NEXT_PUBLIC_CONTACTS_APP_URL],
  fallback:
    process.env.NODE_ENV === 'production'
      ? 'https://contacts.tuturuuu.com'
      : getLocalInternalAppUrl('contacts', 'http://localhost:7827'),
});

export function MailSenderContactCard({
  workspaceId,
  address,
  name,
}: {
  workspaceId?: string;
  address: string;
  name: string | null;
}) {
  const t = useTranslations('mail.sender_contact');
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const restoringFocus = useRef(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const email = address.trim().toLowerCase();
  const validEmail =
    email.length <= 100 && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/u.test(email);
  const lookup = useQuery({
    queryKey: ['mail', 'sender-people-v1', workspaceId, email],
    queryFn: () =>
      searchWorkspacePeople(workspaceId ?? '', { query: email, limit: 20 }),
    enabled: open && Boolean(workspaceId) && validEmail,
    retry: false,
    staleTime: 0,
    gcTime: 0,
  });
  const matches = (lookup.data?.data ?? []).filter(
    (person) => person.email?.trim().toLowerCase() === email
  );

  function cancelClose() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  }
  function reveal() {
    cancelClose();
    setOpen(true);
  }
  function closeAfterPointerLeave() {
    cancelClose();
    closeTimer.current = setTimeout(() => {
      if (
        !trigger.current?.contains(document.activeElement) &&
        !content.current?.contains(document.activeElement)
      )
        setOpen(false);
    }, 150);
  }
  useEffect(
    () => () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    },
    []
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          ref={trigger}
          type="button"
          aria-label={t('show', { sender: name?.trim() || address })}
          className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md text-left outline-ring/50 hover:bg-muted/50 focus-visible:outline-2"
          onPointerEnter={(event) => {
            if (event.pointerType === 'mouse') reveal();
          }}
          onPointerLeave={closeAfterPointerLeave}
          onFocus={() => {
            if (restoringFocus.current) restoringFocus.current = false;
            else reveal();
          }}
          onClick={(event) => {
            event.preventDefault();
            reveal();
            content.current?.focus();
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              reveal();
              content.current?.focus();
            }
          }}
        >
          <UserRound
            className="size-5 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          <span className="truncate font-semibold text-primary text-sm">
            {name?.trim() || address}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        ref={content}
        align="start"
        tabIndex={-1}
        aria-label={t('title')}
        className="max-h-[min(24rem,var(--radix-popover-content-available-height))] w-80 max-w-[calc(100vw-2rem)] space-y-3 overflow-y-auto"
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={() => {
          restoringFocus.current = document.activeElement !== trigger.current;
        }}
        onPointerEnter={cancelClose}
        onPointerLeave={closeAfterPointerLeave}
      >
        <div>
          <p className="font-medium text-sm">{t('message_sender')}</p>
          {name?.trim() ? (
            <p className="break-words text-sm">{name.trim()}</p>
          ) : null}
          <p className="break-all text-muted-foreground text-xs">{address}</p>
        </div>
        <div className="space-y-2 border-t pt-3">
          <p className="font-medium text-sm">{t('title')}</p>
          {!workspaceId || !validEmail ? (
            <p className="text-muted-foreground text-xs">{t('unavailable')}</p>
          ) : lookup.isFetching || lookup.isPending ? (
            <p role="status" className="text-muted-foreground text-xs">
              {t('loading')}
            </p>
          ) : lookup.isError ? (
            <div className="space-y-2">
              <p role="status" className="text-muted-foreground text-xs">
                {t('unavailable')}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void lookup.refetch()}
              >
                {t('retry')}
              </Button>
            </div>
          ) : matches.length ? (
            matches.map((person) => (
              <div
                className="flex items-center gap-2"
                key={`${person.kind}:${person.id}`}
              >
                <Avatar className="size-8">
                  {person.avatarUrl ? (
                    <AvatarImage
                      src={person.avatarUrl}
                      alt=""
                      referrerPolicy="no-referrer"
                    />
                  ) : null}
                  <AvatarFallback>
                    <UserRound className="size-4" aria-hidden="true" />
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">
                    {person.displayName || person.email}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {person.kind === 'contact' ? t('contact') : t('member')}
                  </p>
                  {person.kind === 'contact' ? (
                    <a
                      className="text-primary text-xs underline underline-offset-2"
                      href={`${contactsOrigin}/${encodeURIComponent(locale)}/${encodeURIComponent(workspaceId)}/users/database/${encodeURIComponent(person.id)}`}
                    >
                      {t('open')}
                    </a>
                  ) : null}
                </div>
              </div>
            ))
          ) : (
            <p className="text-muted-foreground text-xs">
              {t('no_visible_match')}
            </p>
          )}
        </div>
        {workspaceId &&
        validEmail &&
        !lookup.isError &&
        !lookup.isFetching &&
        !lookup.isPending &&
        !matches.some((person) => person.kind === 'contact') ? (
          <MailSenderContactCreate
            key={`${workspaceId}:${email}`}
            workspaceId={workspaceId}
            email={email}
            displayName={name?.trim() || null}
            contactsHref={`${contactsOrigin}/${encodeURIComponent(locale)}/${encodeURIComponent(workspaceId)}/users/database`}
            onCreated={() => void lookup.refetch()}
          />
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
