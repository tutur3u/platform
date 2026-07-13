import { Image as ImageIcon, Paperclip, Send, Trash2 } from '@tuturuuu/icons';
import type { GenerateMailAiDraftResponse } from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import { MailComposerAi } from './mail-composer-ai';
import { formatMailBytes } from './mail-composer-utils';

export function MailComposerFooter({
  aiOpen,
  bodyHtml,
  bodyText,
  canSend,
  estimatedBytes,
  mailboxId,
  messageLimit,
  onAiApply,
  onAiOpenChange,
  onDiscard,
  onSend,
  onUpload,
  recipientLimit,
  recipients,
  sending,
  subject,
  threadId,
  uploading,
  workspaceId,
}: {
  aiOpen: boolean;
  bodyHtml: string;
  bodyText: string;
  canSend: boolean;
  estimatedBytes: number;
  mailboxId: string;
  messageLimit: number;
  onAiApply: (result: GenerateMailAiDraftResponse) => void;
  onAiOpenChange: (open: boolean) => void;
  onDiscard: () => void;
  onSend: () => void;
  onUpload: (files: FileList, inline?: boolean) => void;
  recipientLimit: number;
  recipients: string[];
  sending: boolean;
  subject: string;
  threadId?: string;
  uploading: boolean;
  workspaceId: string;
}) {
  const t = useTranslations('mail');

  return (
    <footer className="flex items-center gap-2 border-dynamic border-t px-3 py-2.5">
      <Button disabled={!canSend || sending} onClick={onSend}>
        <Send className="size-4" /> {sending ? t('sending') : t('send')}
      </Button>
      <MailComposerAi
        bodyHtml={bodyHtml}
        bodyText={bodyText}
        mailboxId={mailboxId}
        onApply={onAiApply}
        onOpenChange={onAiOpenChange}
        open={aiOpen}
        recipients={recipients}
        subject={subject}
        threadId={threadId}
        workspaceId={workspaceId}
      />
      <AttachmentButton
        accept={undefined}
        label={t('attach_files')}
        onUpload={(files) => onUpload(files)}
      >
        <Paperclip className="size-4" />
      </AttachmentButton>
      <AttachmentButton
        accept="image/*"
        label={t('insert_images')}
        onUpload={(files) => onUpload(files, true)}
      >
        <ImageIcon className="size-4" />
      </AttachmentButton>
      <span className="ml-auto hidden text-muted-foreground text-xs tabular-nums md:inline">
        {recipients.length}/{recipientLimit} · {formatMailBytes(estimatedBytes)}
        /{formatMailBytes(messageLimit)}
        {uploading ? ` · ${t('uploading')}` : ''}
      </span>
      <Button
        aria-label={t('discard')}
        className="ml-auto md:ml-0"
        onClick={onDiscard}
        size="icon"
        variant="ghost"
      >
        <Trash2 className="size-4" />
      </Button>
    </footer>
  );
}

function AttachmentButton({
  accept,
  children,
  label,
  onUpload,
}: {
  accept?: string;
  children: React.ReactNode;
  label: string;
  onUpload: (files: FileList) => void;
}) {
  return (
    <label className="inline-flex cursor-pointer">
      <input
        accept={accept}
        aria-label={label}
        className="sr-only"
        multiple
        onChange={(event) => event.target.files && onUpload(event.target.files)}
        type="file"
      />
      <Button asChild size="icon" variant="ghost">
        <span>{children}</span>
      </Button>
    </label>
  );
}
