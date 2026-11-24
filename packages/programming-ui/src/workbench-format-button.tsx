'use client';
import { AlignLeft, Loader2 } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { useTranslations } from 'next-intl';
import { useId } from 'react';
import type { FormatSupport } from './format/formatters';
import { FORMAT_SHORTCUT } from './format-shortcut';

/**
 * Format in the editor toolbar. Where there is nothing to format with, or the
 * person cannot edit, the button stays focusable and `aria-disabled`, so its
 * tooltip can still say why.
 */
export function WorkbenchFormatButton({
  support,
  editable,
  pending,
  onFormat,
}: {
  support: FormatSupport;
  editable: boolean;
  pending: boolean;
  onFormat: () => void;
}) {
  const t = useTranslations('programmingPlayground');
  const reasonId = useId();
  const reason = !support.supported
    ? t(
        support.reason === 'rust'
          ? 'formatUnsupportedRust'
          : support.reason === 'ruby'
            ? 'formatUnsupportedRuby'
            : 'formatUnsupportedUnknown'
      )
    : !editable
      ? t('formatReadOnly')
      : undefined;
  const blocked = !!reason;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="outline"
          aria-disabled={blocked || pending ? true : undefined}
          aria-describedby={reason ? reasonId : undefined}
          aria-keyshortcuts={blocked ? undefined : 'Shift+Alt+F'}
          className="h-8 gap-1.5 rounded-full px-3 aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
          onClick={() => {
            if (!blocked && !pending) onFormat();
          }}
        >
          {pending ? (
            <Loader2
              aria-hidden="true"
              className="size-4 animate-spin motion-reduce:animate-none"
            />
          ) : (
            <AlignLeft aria-hidden="true" className="size-4" />
          )}
          {pending ? t('formatting') : t('format')}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {reason ??
          t('runShortcut', {
            action: t('format'),
            shortcut: FORMAT_SHORTCUT,
          })}
      </TooltipContent>
      {reason && (
        <span id={reasonId} className="sr-only">
          {reason}
        </span>
      )}
    </Tooltip>
  );
}
