'use client';

import {
  ArrowLeft,
  AudioLines,
  RefreshCw,
  TriangleAlert,
} from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';

export function VoiceLoadingState({
  compact = false,
  description,
  title,
}: {
  compact?: boolean;
  description: string;
  title: string;
}) {
  if (compact)
    return (
      <div
        role="status"
        className="flex min-w-0 items-center gap-2 px-3 py-2 text-muted-foreground text-xs"
      >
        <AudioLines className="size-4 shrink-0 animate-pulse" />
        <span className="min-w-0">{title}</span>
      </div>
    );
  return (
    <section
      aria-live="polite"
      className="flex min-h-0 flex-1 items-center justify-center p-6 text-center"
    >
      <div className="flex max-w-xs flex-col items-center">
        <div className="relative mb-7 grid size-24 place-items-center">
          <div className="absolute inset-0 animate-pulse rounded-full border border-primary/10 [animation-duration:2.4s]" />
          <div className="absolute inset-3 animate-pulse rounded-full border border-primary/20 bg-primary/5 [animation-delay:240ms] [animation-duration:2.4s]" />
          <div className="grid size-12 place-items-center rounded-full border border-primary/20 bg-background/70 shadow-sm backdrop-blur-xl">
            <AudioLines className="size-5 text-primary" />
          </div>
        </div>
        <h2 className="font-semibold text-xl tracking-tight">{title}</h2>
        <p className="mt-2 text-balance text-muted-foreground text-sm leading-relaxed">
          {description}
        </p>
      </div>
    </section>
  );
}

export function VoiceErrorState({
  compact = false,
  description,
  onReturnToChat,
  onRetry,
  retryLabel,
  returnLabel,
  title,
}: {
  compact?: boolean;
  description: string;
  onReturnToChat: () => void;
  onRetry: () => void;
  retryLabel: string;
  returnLabel: string;
  title: string;
}) {
  if (compact)
    return (
      <div role="alert" className="min-w-0 space-y-2 p-2 text-xs">
        <p className="text-dynamic-red [overflow-wrap:anywhere]">
          {description}
        </p>
        <div className="flex flex-wrap gap-1">
          <Button size="sm" variant="ghost" onClick={onReturnToChat}>
            {returnLabel}
          </Button>
          <Button size="sm" onClick={onRetry}>
            {retryLabel}
          </Button>
        </div>
      </div>
    );
  return (
    <section
      aria-live="assertive"
      className="flex min-h-0 flex-1 items-center justify-center p-6 sm:p-10"
    >
      <div className="flex w-full max-w-sm flex-col items-center text-center">
        <div className="relative grid size-16 place-items-center">
          <div className="absolute inset-0 rounded-full border border-destructive/15 bg-destructive/5" />
          <div className="absolute inset-2 rounded-full border border-destructive/20 bg-background/70 backdrop-blur-xl" />
          <TriangleAlert className="relative size-5 text-destructive" />
        </div>
        <h2 className="mt-6 font-semibold text-2xl tracking-tight">{title}</h2>
        <p className="mx-auto mt-2 max-w-sm text-pretty text-muted-foreground text-sm leading-relaxed">
          {description}
        </p>
        <div className="mt-7 flex items-center justify-center gap-2">
          <Button variant="ghost" onClick={onReturnToChat}>
            <ArrowLeft className="size-4" />
            {returnLabel}
          </Button>
          <Button onClick={onRetry}>
            <RefreshCw className="size-4" />
            {retryLabel}
          </Button>
        </div>
      </div>
    </section>
  );
}
