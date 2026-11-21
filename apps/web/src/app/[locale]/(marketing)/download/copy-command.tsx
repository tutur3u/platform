'use client';

import { Check, Copy } from '@tuturuuu/icons/lucide-static';
import { Button } from '@tuturuuu/ui/button';
import { useRef, useState } from 'react';

type CopyState = 'idle' | 'copied' | 'failed';

export function CopyCommand({
  command,
  labels,
}: {
  command: string;
  labels: { copy: string; copied: string; failed: string };
}) {
  const [state, setState] = useState<CopyState>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const copy = async () => {
    let next: CopyState = 'failed';
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(command);
        next = 'copied';
      }
    } catch {
      next = 'failed';
    }
    setState(next);
    if (timer.current) clearTimeout(timer.current);
    // A failure stays visible until the next attempt.
    if (next === 'copied')
      timer.current = setTimeout(() => setState('idle'), 2000);
  };

  const buttonLabel = state === 'copied' ? labels.copied : labels.copy;

  return (
    <div className="min-w-0">
      <div className="flex min-w-0 items-center gap-2 rounded-xl border border-border/70 bg-muted/50 py-1.5 pr-1.5 pl-4">
        <code className="min-w-0 flex-1 select-all overflow-x-auto whitespace-nowrap font-mono text-sm">
          {command}
        </code>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={copy}
          aria-label={`${buttonLabel}: ${command}`}
        >
          {state === 'copied' ? (
            <Check className="size-4" aria-hidden="true" />
          ) : (
            <Copy className="size-4" aria-hidden="true" />
          )}
        </Button>
      </div>
      <p
        role="status"
        className={
          state === 'failed' ? 'mt-1 text-muted-foreground text-xs' : 'sr-only'
        }
      >
        {state === 'copied'
          ? labels.copied
          : state === 'failed'
            ? labels.failed
            : ''}
      </p>
    </div>
  );
}
