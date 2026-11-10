'use client';

import { ArrowLeft, Loader2, Video } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { useWaitDeadline } from '../hooks/use-wait-deadline';
import { type CallLifecycle, isCallLifecycleBusy } from '../lib/call-state';

/**
 * One stable, full-height shell for server loading, device checks and
 * recovery. While loading it shows the meeting name, the call mark with a
 * spinner, one title, one short status line and a way back. `description`
 * and `children` carry recovery copy and actions for settled outcomes.
 */
export function CallPreparation({
  title,
  description,
  meetingName,
  leaveHref,
  lifecycle = 'preparing',
  busy = isCallLifecycleBusy(lifecycle),
  children,
}: {
  title?: string;
  description?: string;
  meetingName?: string;
  leaveHref?: string;
  /** Drives the spinner; `busy` overrides it for non-call loading states. */
  lifecycle?: CallLifecycle;
  busy?: boolean;
  children?: ReactNode;
}) {
  const t = useTranslations('meet.call');
  const slow = useWaitDeadline(busy, 30_000);
  const spinning = busy && !slow;
  const status = slow
    ? t('join_loading_slow_title')
    : (title ?? t('preparing_call'));
  const line = slow
    ? undefined
    : (description ?? (spinning ? t('connecting') : undefined));
  return (
    <main className="flex min-h-dvh w-full items-center justify-center bg-background px-5 py-10 sm:px-8">
      <section
        className="mx-auto flex w-full max-w-sm flex-col items-center text-center"
        aria-busy={spinning}
      >
        {meetingName && (
          <p className="mb-6 max-w-full truncate text-muted-foreground text-sm">
            {meetingName}
          </p>
        )}
        <div className="relative mb-6 grid size-16 place-items-center rounded-2xl bg-muted">
          <Video className="size-7 text-muted-foreground" aria-hidden="true" />
          {spinning && (
            <span className="absolute -right-1.5 -bottom-1.5 grid size-7 place-items-center rounded-full border bg-background shadow-sm">
              <Loader2
                className="size-4 text-muted-foreground motion-safe:animate-spin"
                aria-hidden="true"
              />
            </span>
          )}
        </div>
        <output aria-live="polite" className="block space-y-1.5">
          <h1 className="text-balance font-semibold text-xl tracking-tight">
            {status}
          </h1>
          {line && (
            <p className="text-pretty text-muted-foreground text-sm">{line}</p>
          )}
        </output>
        {children && <div className="mt-6 w-full space-y-4">{children}</div>}
        {(leaveHref || slow) && (
          <Button variant="ghost" size="sm" className="mt-8" asChild>
            <Link href={leaveHref ?? '/'}>
              <ArrowLeft className="size-4" aria-hidden="true" />
              {t('back_to_meet')}
            </Link>
          </Button>
        )}
      </section>
    </main>
  );
}
