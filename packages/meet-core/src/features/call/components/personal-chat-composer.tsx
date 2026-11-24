'use client';
import { ArrowUp, Mic, RefreshCw } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

/** [mic] [Ask privately…] [send], with notices and live status stacked above. */
export function PersonalChatComposer({
  draft,
  onDraft,
  onSubmit,
  onTalk,
  busy,
  locked,
  retrying,
  children,
}: {
  draft: string;
  onDraft: (value: string) => void;
  onSubmit: () => void;
  /** Present only while Mira can start listening. */
  onTalk?: () => void;
  busy: boolean;
  locked: boolean;
  retrying: boolean;
  children?: ReactNode;
}) {
  const t = useTranslations('meet.call');
  const ta = useTranslations('meet.call.miraEverywhere.tutor.assistant');
  const liveT = useTranslations('meet.live');
  return (
    <form
      className="space-y-2 px-3 pt-2 pb-3"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      {children}
      <div className="flex items-end gap-1 rounded-3xl border bg-background p-1.5 transition-colors focus-within:border-ring motion-reduce:transition-none">
        {onTalk && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-9 shrink-0 rounded-full pointer-coarse:size-11 text-muted-foreground"
            aria-label={ta('talk')}
            disabled={locked}
            onClick={onTalk}
          >
            <Mic aria-hidden className="size-4" />
          </Button>
        )}
        <Textarea
          value={draft}
          rows={1}
          onChange={(event) => onDraft(event.target.value)}
          onKeyDown={(event) => {
            if (
              event.key !== 'Enter' ||
              event.shiftKey ||
              event.nativeEvent.isComposing
            )
              return;
            event.preventDefault();
            event.currentTarget.form?.requestSubmit();
          }}
          maxLength={2000}
          disabled={locked}
          aria-label={t('personal_chat')}
          placeholder={ta('placeholder')}
          className="max-h-32 min-h-9 flex-1 resize-none border-0 bg-transparent px-2 py-2 text-sm shadow-none focus-visible:ring-0 [field-sizing:content]"
        />
        <Button
          type="submit"
          size="icon"
          className="size-9 shrink-0 rounded-full pointer-coarse:size-11"
          aria-label={retrying ? liveT('retry') : t('send')}
          disabled={!draft.trim() || locked}
        >
          {retrying ? (
            <RefreshCw aria-hidden className="size-4" />
          ) : (
            <ArrowUp aria-hidden className="size-4" />
          )}
        </Button>
      </div>
    </form>
  );
}
