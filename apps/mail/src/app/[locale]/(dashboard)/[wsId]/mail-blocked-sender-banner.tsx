'use client';

import { Ban } from '@tuturuuu/icons';
import type { MailSenderBlock } from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  findBlockForSenders,
  senderBlockTarget,
} from './mail-sender-block-model';
import { MailUnblockDialog } from './mail-unblock-dialog';
import {
  useCanManageSenderBlocks,
  useMailSenderBlocks,
} from './use-mail-sender-blocks';

/** Shown above an opened conversation whose sender is currently blocked. */
export function MailBlockedSenderBanner({
  mailboxId,
  senders,
  workspaceId,
}: {
  mailboxId: string;
  senders: readonly string[];
  workspaceId: string;
}) {
  const t = useTranslations('mail.blocked_senders');
  const blocks = useMailSenderBlocks(workspaceId, mailboxId);
  const canManage = useCanManageSenderBlocks(workspaceId, mailboxId);
  const [unblocking, setUnblocking] = useState<MailSenderBlock | null>(null);
  const block = findBlockForSenders(senders, blocks.data ?? []);
  if (!block) return null;
  return (
    <div
      className="mx-2 mt-2 flex items-center gap-2 rounded-lg border border-dynamic-red/30 bg-dynamic-red/10 px-3 py-2 text-sm md:mx-3"
      role="status"
    >
      <Ban className="size-4 shrink-0 text-dynamic-red" />
      <span className="min-w-0 flex-1 truncate">
        {t('banner', { target: senderBlockTarget(block) })}
      </span>
      {canManage ? (
        <Button
          className="h-7"
          onClick={() => setUnblocking(block)}
          size="sm"
          variant="outline"
        >
          {t('unblock')}
        </Button>
      ) : null}
      <MailUnblockDialog
        block={unblocking}
        mailboxId={mailboxId}
        onOpenChange={(open) => {
          if (!open) setUnblocking(null);
        }}
        workspaceId={workspaceId}
      />
    </div>
  );
}
