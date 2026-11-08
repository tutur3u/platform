'use client';

import { ArrowLeft, Loader2 } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { useWaitDeadline } from '../hooks/use-wait-deadline';

/**
 * One stable, full-height shell for server loading, device checks and
 * recovery. While loading it shows only the meeting name, one status line, a
 * spinner and a way back; `description` and `children` are for recovery.
 */
export function CallPreparation({
  title,
  description,
  meetingName,
  leaveHref,
  busy = true,
  children,
}: {
  title?: string;
  description?: string;
  meetingName?: string;
  leaveHref?: string;
  busy?: boolean;
  children?: ReactNode;
}) {
  const t = useTranslations('meet.call');
  const slow = useWaitDeadline(busy, 30_000);
  const spinning = busy && !slow;
  const status = slow
    ? t('join_loading_slow_title')
    : (title ?? t('preparing_call'));
  return (
    <main className="flex min-h-dvh w-full items-center justify-center bg-background px-5 py-10 sm:px-8">
      <section
        className="mx-auto flex w-full max-w-sm flex-col items-center text-center"
        aria-busy={spinning}
      >
        {meetingName && (
          <p className="mb-2 max-w-full truncate font-medium text-base">
            {meetingName}
          </p>
        )}
        <output aria-live="polite" className="block space-y-2">
          <h1
            className={`text-balance ${
              busy
                ? 'text-muted-foreground text-sm'
                : 'font-medium text-base text-foreground'
            }`}
          >
            {status}
          </h1>
          {description && !slow && (
            <p className="text-pretty text-muted-foreground text-sm leading-relaxed">
              {description}
            </p>
          )}
        </output>
        {spinning && (
          <Loader2
            className="mt-6 size-5 text-muted-foreground motion-safe:animate-spin"
            aria-hidden="true"
          />
        )}
        {children && <div className="mt-6 w-full space-y-4">{children}</div>}
        {(leaveHref || slow) && (
          <Button variant="ghost" size="sm" className="mt-6" asChild>
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
