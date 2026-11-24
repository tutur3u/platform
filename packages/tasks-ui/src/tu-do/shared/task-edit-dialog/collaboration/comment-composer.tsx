'use client';

import { Loader2, Send } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useTranslations } from 'next-intl';
import { type KeyboardEvent, useState } from 'react';

interface CommentComposerProps {
  initialValue?: string;
  submitLabel?: string;
  pending?: boolean;
  autoFocus?: boolean;
  onSubmit: (body: string) => Promise<unknown>;
  onCancel?: () => void;
}

export function CommentComposer({
  initialValue = '',
  submitLabel,
  pending = false,
  autoFocus = false,
  onSubmit,
  onCancel,
}: CommentComposerProps) {
  const t = useTranslations('task-collaboration');
  const [value, setValue] = useState(initialValue);
  const trimmed = value.trim();
  const canSubmit = trimmed.length > 0 && !pending;

  const submit = async () => {
    if (!canSubmit) return;
    try {
      await onSubmit(trimmed);
      setValue(initialValue);
    } catch {
      // The mutation reports the failure; the draft stays for a retry.
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void submit();
    }
  };

  return (
    <div className="space-y-2">
      <Textarea
        aria-label={t('comment_label')}
        autoFocus={autoFocus}
        className="min-h-20 text-sm"
        disabled={pending}
        maxLength={65536}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={t('comment_placeholder')}
        value={value}
      />
      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button onClick={onCancel} size="sm" type="button" variant="ghost">
            {t('cancel')}
          </Button>
        )}
        <Button
          disabled={!canSubmit}
          onClick={() => void submit()}
          size="sm"
          type="button"
        >
          {pending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Send className="h-3.5 w-3.5" />
          )}
          {submitLabel ?? t('comment')}
        </Button>
      </div>
    </div>
  );
}
