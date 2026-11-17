'use client';

import { useQueryClient } from '@tanstack/react-query';
import { CircleCheck, ExternalLink, PenLine } from '@tuturuuu/icons';
import type { MailSenderBlock } from '@tuturuuu/internal-api';
import type { ResolvedWorkspacePerson } from '@tuturuuu/internal-api/people';
import { Button } from '@tuturuuu/ui/button';
import { useLocale, useTranslations } from 'next-intl';
import { type ReactNode, useState } from 'react';
import { useStartMailTo } from './mail-compose-context';
import { mailPersonQueryKey } from './mail-people-resolver';
import { MailProfileBlockActions } from './mail-profile-block-actions';
import { profileBlockOptions } from './mail-profile-block-model';
import { MailProfileBlocked } from './mail-profile-blocked';
import type { MailProfileMailbox } from './mail-profile-context';
import { contactsHref } from './mail-profile-links';
import {
  type MailCreatedContact,
  MailSenderContactCreate,
} from './mail-sender-contact-create';

/**
 * Lower part of the profile card: blocked state, the created-contact notice,
 * and the actions for members, contacts and unknown senders.
 */
export function MailProfileCardActions({
  workspaceId,
  mailbox,
  person,
  address,
  headerName,
  displayName,
  emailVisible,
  block,
  unknownActions,
}: {
  workspaceId: string;
  mailbox: MailProfileMailbox | null;
  person: ResolvedWorkspacePerson;
  address: string;
  headerName: string | null;
  displayName: string;
  emailVisible: boolean;
  block: MailSenderBlock | null;
  unknownActions?: ReactNode;
}) {
  const t = useTranslations('mail.profile');
  const ta = useTranslations('mail.profile_actions');
  const locale = useLocale();
  const queryClient = useQueryClient();
  const startMailTo = useStartMailTo();
  const [created, setCreated] = useState<MailCreatedContact | null>(null);
  const blockOptions =
    mailbox && person.kind !== 'member'
      ? profileBlockOptions(mailbox.role, address)
      : null;

  if (block && mailbox)
    return (
      <MailProfileBlocked
        workspaceId={workspaceId}
        mailboxId={mailbox.id}
        block={block}
        canManage={Boolean(profileBlockOptions(mailbox.role, address))}
      />
    );

  const createdNotice = created ? (
    <div className="flex items-center gap-2 px-4 pb-3 text-sm">
      <CircleCheck className="size-4 text-dynamic-green" aria-hidden="true" />
      <p role="status" className="min-w-0 flex-1 truncate">
        {created.workspaceName
          ? ta('created_in', { workspace: created.workspaceName })
          : ta('created')}
      </p>
      <Button asChild variant="secondary" size="sm" className="rounded-full">
        <a href={contactsHref(locale, created.workspaceId, created.contactId)}>
          <ExternalLink className="size-3.5" aria-hidden="true" />
          {ta('open_in_contacts')}
        </a>
      </Button>
    </div>
  ) : null;

  const blockActions =
    blockOptions && mailbox ? (
      <MailProfileBlockActions
        workspaceId={workspaceId}
        mailboxId={mailbox.id}
        options={blockOptions}
      />
    ) : null;

  if (person.kind === 'unknown' && !created)
    return (
      <div className="space-y-2 px-4 pb-4 empty:hidden">
        <MailSenderContactCreate
          key={person.email}
          routeWorkspaceId={workspaceId}
          mailboxWorkspaceId={mailbox?.wsId}
          email={person.email}
          headerName={headerName}
          contactsHref={(target) => contactsHref(locale, target)}
          onCreated={(result) => {
            setCreated(result);
            for (const scope of new Set([workspaceId, result.workspaceId]))
              void queryClient.invalidateQueries({
                queryKey: mailPersonQueryKey(scope, person.email),
              });
          }}
        />
        {blockActions}
        {unknownActions}
      </div>
    );

  return (
    <>
      {createdNotice}
      <div className="flex flex-wrap items-center gap-1.5 border-t px-3 py-3">
        {startMailTo && emailVisible ? (
          <Button
            type="button"
            size="sm"
            className="rounded-full"
            onClick={() => startMailTo(address, displayName)}
          >
            <PenLine className="size-3.5" aria-hidden="true" />
            {t('new_message')}
          </Button>
        ) : null}
        <span className="flex-1" />
        {person.kind === 'contact' && !created ? (
          <Button
            asChild
            variant="secondary"
            size="sm"
            className="rounded-full"
          >
            <a href={contactsHref(locale, workspaceId, person.id)}>
              <ExternalLink className="size-3.5" aria-hidden="true" />
              {t('open_in_contacts')}
            </a>
          </Button>
        ) : null}
      </div>
      {blockActions ? <div className="px-3 pb-3">{blockActions}</div> : null}
    </>
  );
}
