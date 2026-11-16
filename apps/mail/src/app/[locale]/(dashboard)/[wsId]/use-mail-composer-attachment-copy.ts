import { copyMailDraftAttachments } from '@tuturuuu/internal-api';
import { useEffect, useState } from 'react';
import type { MailMediaOwner } from './mail-composer-upload-state';

export interface MailAttachmentCopy {
  attachmentIds: string[];
  sourceMessageId: string;
}

/**
 * Copies a forwarded message's attachments onto the draft once the composer
 * is open. The draft is created first when it does not exist yet.
 */
export function useMailAttachmentCopy({
  ensureDraft,
  mailboxId,
  onCopied,
  onFailed,
  open,
  workspaceId,
}: {
  ensureDraft: () => Promise<string | null>;
  mailboxId: string;
  onCopied: (
    attachments: Awaited<
      ReturnType<typeof copyMailDraftAttachments>
    >['attachments'],
    owner: MailMediaOwner
  ) => void;
  onFailed: () => void;
  open: boolean;
  workspaceId: string;
}) {
  const [pending, setPending] = useState<MailAttachmentCopy | null>(null);
  const [copying, setCopying] = useState(false);

  useEffect(() => {
    if (!open || !pending || !mailboxId) return;
    const copy = pending;
    setPending(null);
    void (async () => {
      setCopying(true);
      try {
        const draftId = await ensureDraft();
        if (!draftId) return;
        const response = await copyMailDraftAttachments(
          workspaceId,
          mailboxId,
          draftId,
          copy
        );
        onCopied(response.attachments, { draftId, mailboxId, workspaceId });
      } catch {
        onFailed();
      } finally {
        setCopying(false);
      }
    })();
  }, [ensureDraft, mailboxId, onCopied, onFailed, open, pending, workspaceId]);

  return { copying, schedule: setPending };
}
