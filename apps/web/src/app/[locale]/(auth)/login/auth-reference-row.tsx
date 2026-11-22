'use client';

import { Check, Copy } from '@tuturuuu/icons/lucide-static';
import { useState } from 'react';

/**
 * A diagnostic reference people can read out or copy for support. The
 * labels come from the caller so each namespace keeps its own copy.
 */
export function AuthReferenceRow({
  code,
  copiedLabel,
  copyLabel,
  label,
}: {
  code: string;
  copiedLabel: string;
  copyLabel: string;
  label: string;
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      // Clipboard access can be blocked; the code stays visible to copy.
    }
  };

  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl bg-muted px-3.5 py-2">
      <span className="min-w-0 text-muted-foreground text-xs">
        {label}{' '}
        <span className="break-all font-mono font-semibold text-foreground">
          {code}
        </span>
      </span>
      <button
        className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-2 font-semibold text-xs underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
        onClick={() => void copy()}
        type="button"
      >
        {copied ? (
          <Check aria-hidden className="size-3.5" />
        ) : (
          <Copy aria-hidden className="size-3.5" />
        )}
        {copied ? copiedLabel : copyLabel}
      </button>
    </div>
  );
}
