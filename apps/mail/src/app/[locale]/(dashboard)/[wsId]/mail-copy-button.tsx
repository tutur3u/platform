'use client';

import { Check, Copy } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { useCopyToClipboard } from '@tuturuuu/ui/hooks/use-copy-to-clipboard';
import { cn } from '@tuturuuu/utils/format';

export function MailCopyButton({
  value,
  label,
  copiedLabel,
  className,
}: {
  value: string;
  label: string;
  copiedLabel: string;
  className?: string;
}) {
  const { isCopied, copyToClipboard } = useCopyToClipboard({ timeout: 1500 });
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={isCopied ? copiedLabel : label}
      title={isCopied ? copiedLabel : label}
      className={cn('size-7 shrink-0 rounded-full', className)}
      onClick={(event) => {
        event.stopPropagation();
        void copyToClipboard(value);
      }}
    >
      {isCopied ? (
        <Check className="size-3.5 text-dynamic-green" aria-hidden="true" />
      ) : (
        <Copy className="size-3.5" aria-hidden="true" />
      )}
      <span className="sr-only" aria-live="polite">
        {isCopied ? copiedLabel : ''}
      </span>
    </Button>
  );
}
