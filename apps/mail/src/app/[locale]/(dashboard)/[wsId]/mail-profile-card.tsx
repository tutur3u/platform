'use client';

import { Ban, BookUser, Globe, Lock, Mail, Users } from '@tuturuuu/icons';
import type { ResolvedWorkspacePerson } from '@tuturuuu/internal-api/people';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Button } from '@tuturuuu/ui/button';
import { LoadingRegion, SkeletonLine } from '@tuturuuu/ui/skeleton';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { MailCopyButton } from './mail-copy-button';
import { mailParticipantInitials } from './mail-participant-avatar';
import {
  mailAddressDomain,
  mailPersonDisplayName,
  mailPersonEmailVisible,
} from './mail-person-display';
import { canManageSenderBlocks } from './mail-profile-block-model';
import { MailProfileCardActions } from './mail-profile-card-actions';
import { useMailProfileMailbox } from './mail-profile-context';
import { findSenderBlock } from './mail-sender-block-model';
import { useMailSenderBlocks } from './use-mail-sender-blocks';

export type MailProfileState =
  | { kind: 'unavailable' }
  | { kind: 'loading' }
  | { kind: 'error'; retry: () => void }
  | { kind: 'ready'; person: ResolvedWorkspacePerson };

const BAND = {
  member: 'bg-dynamic-blue',
  contact: 'bg-dynamic-teal',
  unknown: 'bg-muted',
  blocked: 'bg-muted-foreground/40',
} as const;

/**
 * Identity card for one mail address. Inside the mail client it also offers
 * Add to Contacts and Block, and shows the Blocked state for a sender the
 * open mailbox blocks. `unknownActions` is the slot for further actions on
 * addresses that are not yet a member or contact.
 */
export function MailProfileCard({
  workspaceId,
  address,
  name,
  state,
  unknownActions,
}: {
  workspaceId?: string;
  address: string;
  name: string | null;
  state: MailProfileState;
  unknownActions?: ReactNode;
}) {
  const t = useTranslations('mail.profile');
  const tb = useTranslations('mail.profile_actions');
  const mailbox = useMailProfileMailbox();
  const blocks = useMailSenderBlocks(
    workspaceId,
    mailbox && canManageSenderBlocks(mailbox.role) ? mailbox.id : undefined
  );
  const block = findSenderBlock(address, blocks.data ?? []);
  const person = state.kind === 'ready' ? state.person : undefined;
  const kind = person?.kind ?? 'unknown';
  const displayName = mailPersonDisplayName(person, name, address, t('member'));
  const emailVisible = mailPersonEmailVisible(person);
  const domain = mailAddressDomain(address);

  return (
    <div className="overflow-hidden">
      <div
        className={cn(
          'h-1',
          BAND[block ? 'blocked' : (kind as keyof typeof BAND)]
        )}
        aria-hidden="true"
      />
      <div className="flex items-start gap-3 p-4 pb-3">
        <Avatar className="size-12 shrink-0" aria-hidden="true">
          {person?.avatarUrl ? (
            <AvatarImage
              src={person.avatarUrl}
              alt=""
              referrerPolicy="no-referrer"
            />
          ) : null}
          <AvatarFallback className="bg-muted font-semibold text-sm">
            {mailParticipantInitials(
              displayName,
              emailVisible ? address : displayName
            )}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="break-words font-bold text-base leading-tight tracking-tight">
            {displayName}
          </p>
          {kind === 'unknown' && displayName !== address ? (
            <p className="mt-0.5 break-all text-muted-foreground text-sm">
              {address}
            </p>
          ) : null}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {block ? (
              <Chip className="bg-muted text-muted-foreground">
                <Ban className="size-3" aria-hidden="true" />
                {block.kind === 'domain'
                  ? tb('state_domain')
                  : tb('state_sender')}
              </Chip>
            ) : kind === 'member' ? (
              <Chip className="bg-dynamic-blue/10 text-dynamic-blue">
                <Users className="size-3" aria-hidden="true" />
                {t('member')}
              </Chip>
            ) : kind === 'contact' ? (
              <Chip className="bg-dynamic-teal/10 text-dynamic-teal">
                <BookUser className="size-3" aria-hidden="true" />
                {t('contact')}
              </Chip>
            ) : domain ? (
              <Chip className="bg-muted text-muted-foreground">
                <Globe className="size-3" aria-hidden="true" />
                {domain}
              </Chip>
            ) : null}
          </div>
        </div>
      </div>

      {state.kind === 'ready' && kind !== 'unknown' ? (
        <div className="px-4 pb-3">
          {emailVisible ? (
            <div className="grid grid-cols-[1rem_minmax(0,1fr)_auto] items-center gap-2.5 text-sm">
              <Mail
                className="size-4 text-muted-foreground"
                aria-hidden="true"
              />
              <span className="truncate">{address}</span>
              <MailCopyButton
                value={address}
                label={t('copy_email')}
                copiedLabel={t('copied')}
              />
            </div>
          ) : (
            <div className="grid min-h-7 grid-cols-[1rem_minmax(0,1fr)] items-center gap-2.5 text-muted-foreground text-sm">
              <Lock className="size-4" aria-hidden="true" />
              <span>{t('email_hidden')}</span>
            </div>
          )}
        </div>
      ) : null}

      {state.kind === 'loading' ? (
        <LoadingRegion srLabel={t('loading')} className="px-4 pb-4">
          <SkeletonLine size="xs" barClassName="w-2/3" />
        </LoadingRegion>
      ) : state.kind === 'unavailable' ? (
        <p className="px-4 pb-4 text-muted-foreground text-xs">
          {t('unavailable')}
        </p>
      ) : state.kind === 'error' ? (
        <div className="flex items-center gap-2 px-4 pb-4">
          <p role="status" className="flex-1 text-muted-foreground text-xs">
            {t('unavailable')}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={state.retry}
          >
            {t('retry')}
          </Button>
        </div>
      ) : null}

      {person && workspaceId ? (
        <MailProfileCardActions
          workspaceId={workspaceId}
          mailbox={mailbox}
          person={person}
          address={address}
          headerName={name?.trim() || null}
          displayName={displayName}
          emailVisible={emailVisible}
          block={block}
          unknownActions={unknownActions}
        />
      ) : null}
    </div>
  );
}

function Chip({
  className,
  children,
}: {
  className: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium text-xs',
        className
      )}
    >
      {children}
    </span>
  );
}
