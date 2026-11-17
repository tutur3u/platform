'use client';

import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@tuturuuu/ui/hover-card';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useMailPerson } from './mail-people-resolver';
import { mailPersonDisplayName } from './mail-person-display';
import { MailProfileCard, type MailProfileState } from './mail-profile-card';
import {
  MailProfileHoldProvider,
  useMailProfileHoldState,
} from './mail-profile-context';

export const MAIL_PROFILE_HOVER_DELAY_MS = 300;

const VALID_EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/u;

/** Resolved identity, display label and card state for one address. */
export function useMailPersonProfile(
  workspaceId: string | undefined,
  address: string,
  name: string | null | undefined
) {
  const t = useTranslations('mail.profile');
  const email = address.trim().toLowerCase();
  const resolvable =
    Boolean(workspaceId) && email.length <= 254 && VALID_EMAIL.test(email);
  const query = useMailPerson(resolvable ? workspaceId : undefined, email);
  const state: MailProfileState = !resolvable
    ? { kind: 'unavailable' }
    : query.data
      ? { kind: 'ready', person: query.data }
      : query.isError
        ? { kind: 'error', retry: () => void query.refetch() }
        : { kind: 'loading' };
  return {
    person: query.data,
    state,
    label: mailPersonDisplayName(query.data, name, address, t('member')),
  };
}

/**
 * Resolved name inside an interactive row. It opens the profile card on hover
 * only, because the row itself is the keyboard target; the reading pane offers
 * the keyboard path to the same card. The card stays open while it holds
 * itself open (a dirty form or an open dialog).
 */
export function MailPersonName({
  workspaceId,
  address,
  name,
  className,
  addressClassName,
}: {
  workspaceId?: string;
  address: string;
  name: string | null | undefined;
  className?: string;
  /** Applied when the label is the bare address. */
  addressClassName?: string;
}) {
  const profile = useMailPersonProfile(workspaceId, address, name);
  const [open, setOpen] = useState(false);
  const hold = useMailProfileHoldState();
  return (
    <HoverCard
      open={open}
      onOpenChange={(next) => {
        if (!next && hold.held) return;
        setOpen(next);
      }}
      openDelay={MAIL_PROFILE_HOVER_DELAY_MS}
      closeDelay={150}
    >
      <HoverCardTrigger asChild>
        <span
          className={cn(
            'min-w-0 truncate',
            className,
            profile.label === address.trim() && addressClassName
          )}
        >
          {profile.label}
        </span>
      </HoverCardTrigger>
      <HoverCardContent
        align="start"
        className="w-[min(21.25rem,calc(100vw-2rem))] rounded-2xl p-0"
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <MailProfileHoldProvider report={hold.report}>
          <MailProfileCard
            workspaceId={workspaceId}
            address={address}
            name={name ?? null}
            state={profile.state}
          />
        </MailProfileHoldProvider>
      </HoverCardContent>
    </HoverCard>
  );
}
