'use client';

import {
  AudioLines,
  MessageSquareText,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
} from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';

export function VoiceLoadingState({
  description,
  privacyNote,
  title,
}: {
  description: string;
  privacyNote: string;
  title: string;
}) {
  return (
    <section
      aria-live="polite"
      className="flex min-h-0 flex-1 items-center justify-center p-6 text-center"
    >
      <div className="flex max-w-sm flex-col items-center">
        <div className="relative mb-6 grid size-20 place-items-center">
          <div className="absolute inset-0 animate-ping rounded-full border border-primary/15 [animation-duration:2.4s]" />
          <div className="absolute inset-2 rounded-full border border-primary/20 bg-primary/5" />
          <AudioLines className="relative size-7 animate-pulse text-primary" />
        </div>
        <p className="font-semibold text-lg tracking-tight">{title}</p>
        <p className="mt-2 text-balance text-muted-foreground text-sm leading-relaxed">
          {description}
        </p>
        <div className="mt-5 inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/45 px-3 py-1.5 text-muted-foreground text-xs backdrop-blur-sm">
          <ShieldCheck className="size-3.5 text-primary" />
          <span>{privacyNote}</span>
        </div>
      </div>
    </section>
  );
}

export function VoiceErrorState({
  description,
  note,
  onReturnToChat,
  onRetry,
  retryLabel,
  returnLabel,
  title,
}: {
  description: string;
  note: string;
  onReturnToChat: () => void;
  onRetry: () => void;
  retryLabel: string;
  returnLabel: string;
  title: string;
}) {
  return (
    <section
      aria-live="assertive"
      className="flex min-h-0 flex-1 items-center justify-center p-4 sm:p-8"
    >
      <div className="w-full max-w-md rounded-2xl border border-border/60 bg-background/55 p-5 text-center shadow-foreground/5 shadow-lg backdrop-blur-md sm:p-7">
        <div className="mx-auto grid size-12 place-items-center rounded-xl border border-destructive/15 bg-destructive/8">
          <TriangleAlert className="size-5 text-destructive" />
        </div>
        <h2 className="mt-5 font-semibold text-xl tracking-tight">{title}</h2>
        <p className="mx-auto mt-2 max-w-sm text-pretty text-muted-foreground text-sm leading-relaxed">
          {description}
        </p>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-center">
          <Button variant="outline" onClick={onReturnToChat}>
            <MessageSquareText className="size-4" />
            {returnLabel}
          </Button>
          <Button onClick={onRetry}>
            <RefreshCw className="size-4" />
            {retryLabel}
          </Button>
        </div>
        <p className="mt-5 border-border/50 border-t pt-4 text-muted-foreground text-xs leading-relaxed">
          {note}
        </p>
      </div>
    </section>
  );
}
