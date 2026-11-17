'use client';

import type {
  MailSenderBlock,
  MailThreadSummary,
} from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { findBlockForSenders } from './mail-sender-block-model';
import { MailUnblockDialog } from './mail-unblock-dialog';
import {
  useCanManageSenderBlocks,
  useMailSenderBlocks,
} from './use-mail-sender-blocks';

/** Blocked-folder row footer: which rule caught the sender, and Unblock. */
export function MailBlockedRowMarker({
  thread,
  workspaceId,
}: {
  thread: MailThreadSummary;
  workspaceId: string;
}) {
  const t = useTranslations('mail.blocked_senders');
  const blocks = useMailSenderBlocks(workspaceId, thread.mailboxId);
  const canManage = useCanManageSenderBlocks(workspaceId, thread.mailboxId);
  const [unblocking, setUnblocking] = useState<MailSenderBlock | null>(null);
  const block = findBlockForSenders(
    thread.participants.map((participant) => participant.address),
    blocks.data ?? []
  );
  if (!block) return null;
  return (
    <div className="flex items-center gap-2 px-3 pb-2 pl-10 text-muted-foreground text-xs">
      <span className="min-w-0 truncate">
        {block.kind === 'domain'
          ? t('marker_domain', { domain: block.value })
          : t('marker_sender')}
      </span>
      {canManage ? (
        <Button
          className="h-6 px-2 text-xs"
          onClick={() => setUnblocking(block)}
          size="sm"
          variant="ghost"
        >
          {t('unblock')}
        </Button>
      ) : null}
      <MailUnblockDialog
        block={unblocking}
        mailboxId={thread.mailboxId}
        onOpenChange={(open) => {
          if (!open) setUnblocking(null);
        }}
        workspaceId={workspaceId}
      />
    </div>
  );
}
