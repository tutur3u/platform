'use client';

import { Check, Copy } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { useCopyToClipboard } from '@tuturuuu/ui/hooks/use-copy-to-clipboard';

export function CodeSnippet({
  copiedLabel,
  copyLabel,
  language,
  value,
}: {
  copiedLabel: string;
  copyLabel: string;
  language: string;
  value: string;
}) {
  const { isCopied, copyToClipboard } = useCopyToClipboard({ timeout: 2_000 });

  return (
    <div className="overflow-hidden rounded-xl border bg-foreground/[0.025]">
      <div className="flex items-center justify-between border-b bg-muted/30 px-3 py-2">
        <span className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
          {language}
        </span>
        <Button
          className="h-7 gap-1.5 px-2 text-xs"
          onClick={() => copyToClipboard(value)}
          size="sm"
          variant="ghost"
        >
          {isCopied ? (
            <Check className="size-3.5" />
          ) : (
            <Copy className="size-3.5" />
          )}
          {isCopied ? copiedLabel : copyLabel}
        </Button>
      </div>
      <pre className="max-h-[32rem] overflow-auto p-4 font-mono text-[0.78rem] leading-6">
        <code>{value}</code>
      </pre>
    </div>
  );
}
