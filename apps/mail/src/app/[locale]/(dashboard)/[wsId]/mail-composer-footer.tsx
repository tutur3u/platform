import { Image as ImageIcon, Paperclip, Send } from '@tuturuuu/icons';
import type { GenerateMailAiDraftResponse } from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import { MailComposerAi } from './mail-composer-ai';
import { formatMailBytes } from './mail-composer-utils';

export function MailComposerFooter({
  selectionOnly,
  aiOpen,
  bodyHtml,
  bodyText,
  canSend,
  estimatedBytes,
  mailboxId,
  messageLimit,
  onAiApply,
  onAiOpenChange,
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
  selectionOnly: boolean;
  aiOpen: boolean;
  bodyHtml: string;
  bodyText: string;
  canSend: boolean;
  estimatedBytes: number;
  mailboxId: string;
  messageLimit: number;
  onAiApply: (result: GenerateMailAiDraftResponse) => void;
  onAiOpenChange: (open: boolean) => void;
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
    <footer className="flex flex-wrap items-center gap-1.5 border-dynamic border-t bg-muted/20 px-3 py-3">
      <Button
        className="rounded-lg px-5"
        disabled={!canSend || sending || uploading}
        onClick={onSend}
      >
        <Send className="size-4" /> {sending ? t('sending') : t('send')}
      </Button>
      <MailComposerAi
        key={`${selectionOnly}:${bodyHtml}:${bodyText}`}
        selectionOnly={selectionOnly}
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
    <label className="inline-flex cursor-pointer rounded-md focus-within:ring-2 focus-within:ring-ring">
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
