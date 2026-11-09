import { CheckCircle2, ClipboardList, Paperclip } from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { MessageFileAttachment } from '../file-preview-chips';
import { MessageFileAttachments } from '../file-preview-chips';

export function UserMessage({ text }: { text: string }) {
  const t = useTranslations('dashboard.mira_chat');
  const [expanded, setExpanded] = useState(false);

  if (text.startsWith('### ')) {
    const lines = text.split('\n');
    const title = lines[0]?.replace('### ', '').trim();
    const fields = lines
      .slice(1)
      .filter((line) => line.trim().startsWith('**'))
      .map((line) => {
        const parts = line.split(':');
        const label = parts[0]?.replace(/\*\*/g, '').trim();
        const value = parts.slice(1).join(':').trim();
        return { label, value };
      });

    if (fields.length > 0) {
      return (
        <div className="flex flex-col gap-3 py-1 text-background">
          <div className="flex items-center gap-2 border-background/20 border-b pb-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-background/10 text-background">
              <ClipboardList className="h-4 w-4" />
            </div>
            <div>
              <div className="font-bold text-sm tracking-tight">{title}</div>
              <div className="font-medium text-background/50 text-xs uppercase tracking-wider">
                {t('submission')}
              </div>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {fields.map((field, i) => (
              <div
                key={`${field.label}-${i}`}
                className="flex flex-col gap-0.5 rounded-lg border border-background/10 bg-background/5 p-2"
              >
                <span className="font-bold text-[10px] text-background/40 uppercase tracking-wider">
                  {field.label}
                </span>
                <span className="truncate font-medium text-xs">
                  {field.value}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-1 flex items-center justify-end gap-1.5 font-bold text-[10px] text-background/40 uppercase tracking-widest">
            <CheckCircle2 className="h-3 w-3" />
            {t('form_submitted')}
          </div>
        </div>
      );
    }
  }

  const isLong = text.length > 300 || (text.match(/\n/g) || []).length > 2;

  if (!isLong) {
    return <p className="wrap-break-word whitespace-pre-wrap">{text}</p>;
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <div
        className={cn(
          'wrap-break-word whitespace-pre-wrap transition-all',
          !expanded && 'line-clamp-3 text-ellipsis'
        )}
      >
        {text}
      </div>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="mt-1 font-medium text-[10px] text-background/80 transition-colors hover:text-background"
      >
        {expanded ? t('show_less') : t('show_more')}
      </button>
    </div>
  );
}

export function UserMessageContent({
  displayText,
  attachments,
}: {
  displayText: string;
  attachments?: MessageFileAttachment[];
}) {
  const t = useTranslations('dashboard.mira_chat');
  const hasDisplayText = displayText.trim().length > 0;
  const hasAttachments = (attachments?.length ?? 0) > 0;

  if (!hasDisplayText && hasAttachments) {
    return (
      <>
        <MessageFileAttachments attachments={attachments!} invertColors />
        <div className="flex items-center gap-1.5 px-0.5 text-background/60">
          <Paperclip className="h-3 w-3" />
          <span className="text-[11px]">
            {t('files_attached', { count: attachments!.length })}
          </span>
        </div>
      </>
    );
  }

  return (
    <>
      {hasAttachments && (
        <div className="mb-1.5">
          <MessageFileAttachments attachments={attachments!} invertColors />
        </div>
      )}
      {hasDisplayText && <UserMessage text={displayText} />}
    </>
  );
}
