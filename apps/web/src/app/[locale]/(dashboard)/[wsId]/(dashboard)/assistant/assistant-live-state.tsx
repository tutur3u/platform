'use client';

import {
  ArrowLeft,
  AudioLines,
  RefreshCw,
  TriangleAlert,
} from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';

export function VoiceLoadingState({
  description,
  title,
}: {
  description: string;
  title: string;
}) {
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
  description,
  onReturnToChat,
  onRetry,
  retryLabel,
  returnLabel,
  title,
}: {
  description: string;
  onReturnToChat: () => void;
  onRetry: () => void;
  retryLabel: string;
  returnLabel: string;
  title: string;
}) {
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
