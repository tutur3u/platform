import { copyMailDraftAttachments } from '@tuturuuu/internal-api';
import { useEffect, useRef, useState } from 'react';
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
  const generation = useRef(0);
  const latest = useRef({ mailboxId, open, workspaceId });
  latest.current = { mailboxId, open, workspaceId };

  useEffect(() => {
    generation.current += 1;
    setCopying(false);
    return () => {
      generation.current += 1;
    };
  }, [mailboxId, open, workspaceId]);

  useEffect(() => {
    if (!open || !pending || !mailboxId) return;
    const copy = pending;
    const startedIn = generation.current;
    const isCurrent = () =>
      generation.current === startedIn &&
      latest.current.open &&
      latest.current.mailboxId === mailboxId &&
      latest.current.workspaceId === workspaceId;
    setPending(null);
    void (async () => {
      setCopying(true);
      try {
        const draftId = await ensureDraft();
        if (!draftId || !isCurrent()) return;
        const response = await copyMailDraftAttachments(
          workspaceId,
          mailboxId,
          draftId,
          copy
        );
        if (isCurrent())
          onCopied(response.attachments, { draftId, mailboxId, workspaceId });
      } catch {
        if (isCurrent()) onFailed();
      } finally {
        if (isCurrent()) setCopying(false);
      }
    })();
  }, [ensureDraft, mailboxId, onCopied, onFailed, open, pending, workspaceId]);

  return { copying, schedule: setPending };
}
