'use client';

import { Sparkles, X } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import type { CallChatMessage } from '../lib/call-state';

/** A room Mira system line: one quiet row that can be dismissed. */
export function ChatSystemLine({
  notice,
  onDismiss,
}: {
  notice: NonNullable<CallChatMessage['notice']>;
  onDismiss: () => void;
}) {
  const t = useTranslations('meet.mira_consent');
  return (
    <div
      role="status"
      className="flex items-center gap-2 rounded-xl bg-muted/40 py-1 ps-2.5 pe-1 text-muted-foreground text-xs"
    >
      <Sparkles aria-hidden className="size-4 shrink-0" />
      <span className="min-w-0 flex-1 text-pretty">
        {notice.kind === 'mira.on'
          ? t('indicator_on', { name: notice.by ?? '' })
          : t('system_off')}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-6 shrink-0 pointer-coarse:size-9"
        aria-label={t('dismiss_line')}
        onClick={onDismiss}
      >
        <X aria-hidden className="size-4" />
      </Button>
    </div>
  );
}
