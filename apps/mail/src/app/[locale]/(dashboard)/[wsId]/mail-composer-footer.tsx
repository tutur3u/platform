import {
  AlertCircle,
  Image as ImageIcon,
  Loader2,
  Paperclip,
  Send,
} from '@tuturuuu/icons';
import type { GenerateMailAiDraftResponse } from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { MailComposerAi } from './mail-composer-ai';
import { formatMailBytes } from './mail-composer-utils';

export function MailComposerFooter({
  announcement,
  selectionOnly,
  aiOpen,
  bodyHtml,
  bodyText,
  canSend,
  estimatedBytes,
  mailboxId,
  mediaFailed,
  mediaPending,
  messageLimit,
  onAiApply,
  onAiOpenChange,
  onJumpToFailed,
  onSend,
  onUpload,
  recipientLimit,
  recipients,
  sending,
  subject,
  threadId,
  workspaceId,
}: {
  /** Localized screen-reader text for the latest upload or removal event. */
  announcement: string;
  selectionOnly: boolean;
  aiOpen: boolean;
  bodyHtml: string;
  bodyText: string;
  canSend: boolean;
  estimatedBytes: number;
  mailboxId: string;
  /** Uploads that failed and need Retry or Remove. */
  mediaFailed: number;
  /** Items queued or uploading. */
  mediaPending: number;
  messageLimit: number;
  onAiApply: (result: GenerateMailAiDraftResponse) => void;
  onAiOpenChange: (open: boolean) => void;
  onJumpToFailed: () => void;
  onSend: () => void;
  onUpload: (files: FileList, inline?: boolean) => void;
  recipientLimit: number;
  recipients: string[];
  sending: boolean;
  subject: string;
  threadId?: string;
  workspaceId: string;
}) {
  const t = useTranslations('mail');
  const hasStatus = mediaPending > 0 || mediaFailed > 0;

  return (
    <footer className="flex flex-wrap items-center gap-1.5 border-dynamic border-t bg-muted/20 px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]">
      <Button
        className="rounded-lg px-5"
        disabled={!canSend || sending}
        onClick={onSend}
      >
        <Send className="size-4" /> {sending ? t('sending') : t('send')}
      </Button>
      <MailComposerAi
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
      <span aria-live="polite" className="sr-only">
        {announcement}
      </span>
      {hasStatus ? (
        <span className="ml-auto flex items-center gap-1.5">
          {mediaPending > 0 ? (
            <span
              className="inline-flex h-8 items-center gap-1.5 rounded-full bg-dynamic-blue/10 px-2.5 font-semibold text-foreground text-xs pointer-coarse:h-11"
              role="status"
            >
              <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" />
              {t('uploading_count', { count: mediaPending })}
            </span>
          ) : null}
          {mediaFailed > 0 ? (
            <button
              className="inline-flex h-8 items-center gap-1.5 rounded-full bg-dynamic-red/10 px-2.5 font-semibold text-dynamic-red text-xs pointer-coarse:h-11"
              onClick={onJumpToFailed}
              type="button"
            >
              <AlertCircle className="size-3.5" />
              {t('upload_failed_count', { count: mediaFailed })}
            </button>
          ) : null}
        </span>
      ) : null}
      <span
        className={cn(
          'hidden text-muted-foreground text-xs tabular-nums md:inline',
          hasStatus ? 'ml-2' : 'ml-auto'
        )}
      >
        {recipients.length}/{recipientLimit} · {formatMailBytes(estimatedBytes)}
        /{formatMailBytes(messageLimit)}
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
        data-mail-attach-trigger={accept ? undefined : ''}
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
