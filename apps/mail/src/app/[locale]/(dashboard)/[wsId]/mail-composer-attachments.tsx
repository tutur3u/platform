import { Paperclip, X } from '@tuturuuu/icons';
import type { MailAttachment } from '@tuturuuu/internal-api';

export function MailComposerAttachments({
  attachments,
  onRemove,
  removeLabel,
}: {
  attachments: MailAttachment[];
  onRemove: (attachment: MailAttachment) => Promise<void>;
  removeLabel: string;
}) {
  if (attachments.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 border-dynamic border-t px-3 py-2">
      {attachments.map((attachment) => (
        <div
          className="flex min-w-0 items-center gap-2 rounded-lg bg-foreground/[0.05] px-2 py-1 text-xs"
          key={attachment.id}
        >
          <Paperclip className="size-3 shrink-0" />
          <span className="max-w-44 truncate">{attachment.filename}</span>
          <span className="text-[0.68rem] text-muted-foreground">
            {formatBytes(attachment.sizeBytes)}
          </span>
          <button
            aria-label={removeLabel}
            className="rounded-sm p-0.5 text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
            onClick={() => void onRemove(attachment)}
            type="button"
          >
            <X className="size-3" />
          </button>
        </div>
      ))}
    </div>
  );
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
