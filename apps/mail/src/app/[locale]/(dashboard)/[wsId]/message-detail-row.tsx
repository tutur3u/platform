'use client';

import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { type ReactNode, useState } from 'react';
import { MailCopyButton } from './mail-copy-button';
import { mailPersonEmailVisible } from './mail-person-display';
import { useMailPersonProfile } from './mail-person-name';
import { MailSenderContactCard } from './mail-sender-contact-card';
import {
  MESSAGE_ID_PREVIEW_LENGTH,
  type MailAddress,
} from './message-details-model';

/** One label/value row; unknown headers pass `rawLabel` for a mono label. */
export function MessageDetailRow({
  label,
  rawLabel = false,
  children,
}: {
  label: string;
  rawLabel?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-x-3 gap-y-0.5 py-1 sm:grid-cols-[7.5rem_minmax(0,1fr)]">
      <dt
        className={cn(
          'pt-1 text-muted-foreground text-xs',
          rawLabel ? 'break-all font-mono' : 'font-medium'
        )}
      >
        {label}
      </dt>
      <dd className="min-w-0 space-y-0.5">{children}</dd>
    </div>
  );
}

/** Avatar, name (opens the profile card), visible email and copy. */
export function MessagePersonRow({
  workspaceId,
  person,
}: {
  workspaceId?: string;
  person: MailAddress;
}) {
  const t = useTranslations('mail.message_details_panel');
  const profile = useMailPersonProfile(
    workspaceId,
    person.address,
    person.name
  );
  const emailVisible = mailPersonEmailVisible(profile.person);
  const secondary = emailVisible
    ? profile.label === person.address
      ? null
      : person.address
    : profile.person?.kind === 'contact'
      ? t('contact')
      : t('member');
  return (
    <div className="group/person flex min-w-0 items-center gap-1 rounded-full pr-0.5 hover:bg-muted/40">
      <MailSenderContactCard
        workspaceId={workspaceId}
        address={person.address}
        name={person.name}
        variant="inline"
      />
      <span className="min-w-0 flex-1 truncate text-muted-foreground text-xs">
        {secondary}
      </span>
      {emailVisible ? (
        <MailCopyButton
          value={person.address}
          label={t('copy_email')}
          copiedLabel={t('copied')}
          className="size-6 opacity-100 focus-visible:opacity-100 group-hover/person:opacity-100 md:opacity-0"
        />
      ) : null}
    </div>
  );
}

/** Monospace identifier that truncates behind "Show all", with copy. */
export function MessageIdValue({ value }: { value: string }) {
  const t = useTranslations('mail.message_details_panel');
  const [expanded, setExpanded] = useState(false);
  const long = value.length > MESSAGE_ID_PREVIEW_LENGTH;
  return (
    <div className="flex min-w-0 items-start gap-1">
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            'pt-1 font-mono text-xs',
            expanded || !long ? 'break-all' : 'truncate'
          )}
        >
          {value}
        </p>
        {long ? (
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => setExpanded((current) => !current)}
            className="rounded font-medium text-dynamic-blue text-xs outline-ring/50 hover:underline focus-visible:outline-2"
          >
            {expanded ? t('show_less') : t('show_all')}
          </button>
        ) : null}
      </div>
      <MailCopyButton
        value={value}
        label={t('copy_message_id')}
        copiedLabel={t('copied')}
        className="size-6"
      />
    </div>
  );
}
