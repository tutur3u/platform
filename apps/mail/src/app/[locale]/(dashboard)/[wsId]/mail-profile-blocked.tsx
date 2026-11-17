'use client';

import { BellOff, Globe } from '@tuturuuu/icons';
import type { MailSenderBlock } from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { getMailFolderHref } from './mail-folders';
import { useHoldMailProfile } from './mail-profile-context';
import { MailUnblockDialog } from './mail-unblock-dialog';

/** Href of a mailbox's Blocked folder. */
export function blockedFolderHref(workspaceId: string, mailboxId: string) {
  const href = getMailFolderHref(workspaceId, 'blocked');
  return `${href}?mailbox=${encodeURIComponent(mailboxId)}`;
}

/** Card body for a blocked sender: what the block does, Unblock, Open Blocked. */
export function MailProfileBlocked({
  workspaceId,
  mailboxId,
  block,
  canManage,
}: {
  workspaceId: string;
  mailboxId: string;
  block: MailSenderBlock;
  canManage: boolean;
}) {
  const t = useTranslations('mail.profile_actions');
  const [unblocking, setUnblocking] = useState(false);
  useHoldMailProfile(unblocking);

  return (
    <>
      <div className="space-y-2 px-4 pb-3 text-sm">
        {block.kind === 'domain' ? (
          <div className="grid grid-cols-[1rem_minmax(0,1fr)] items-center gap-2.5">
            <Globe
              className="size-4 text-muted-foreground"
              aria-hidden="true"
            />
            <span className="truncate">
              {t('whole_domain', { domain: block.value })}
            </span>
          </div>
        ) : null}
        <div className="grid grid-cols-[1rem_minmax(0,1fr)] items-center gap-2.5 text-muted-foreground">
          <BellOff className="size-4" aria-hidden="true" />
          <span>{t('effect')}</span>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 border-t px-3 py-3">
        {canManage ? (
          <Button
            type="button"
            size="sm"
            className="rounded-full"
            onClick={() => setUnblocking(true)}
          >
            {t('unblock')}
          </Button>
        ) : null}
        <span className="flex-1" />
        <Button asChild variant="secondary" size="sm" className="rounded-full">
          <a href={blockedFolderHref(workspaceId, mailboxId)}>
            {t('open_blocked')}
          </a>
        </Button>
      </div>
      {canManage ? (
        <MailUnblockDialog
          block={unblocking ? block : null}
          mailboxId={mailboxId}
          workspaceId={workspaceId}
          onOpenChange={(open) => {
            if (!open) setUnblocking(false);
          }}
        />
      ) : null}
    </>
  );
}
