'use client';

import {
  ArrowLeft,
  Loader2,
  MonitorSmartphone,
  ShieldCheck,
} from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

/** One stable, full-height shell for server loading, device checks and recovery. */
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
  return (
    <main className="flex min-h-dvh w-full items-center justify-center bg-background px-5 py-10 sm:px-8">
      <section
        className="mx-auto flex w-full max-w-md flex-col items-center text-center"
        aria-busy={busy}
      >
        {meetingName && (
          <p className="mb-8 max-w-full truncate text-muted-foreground text-sm">
            {meetingName}
          </p>
        )}
        <div className="relative mb-6 grid size-20 place-items-center rounded-3xl border bg-muted/40">
          <MonitorSmartphone
            className="size-8 text-foreground/80"
            aria-hidden="true"
          />
          {busy && (
            <span className="absolute -right-2 -bottom-2 grid size-8 place-items-center rounded-full border bg-background">
              <Loader2
                className="size-4 motion-safe:animate-spin"
                aria-hidden="true"
              />
            </span>
          )}
        </div>
        <div role="status" aria-live="polite" className="space-y-3">
          <h1 className="text-balance font-semibold text-2xl tracking-tight">
            {title ?? t('preparing_call')}
          </h1>
          <p className="text-pretty text-muted-foreground text-sm leading-relaxed">
            {description ?? t('preparing_call_hint')}
          </p>
        </div>
        {children && <div className="mt-6 w-full space-y-4">{children}</div>}
        <p className="mt-8 flex items-center justify-center gap-2 text-muted-foreground text-xs">
          <ShieldCheck className="size-4 shrink-0" aria-hidden="true" />
          {t('preparing_privacy')}
        </p>
        {leaveHref && (
          <Button variant="ghost" className="mt-5" asChild>
            <Link href={leaveHref}>
              <ArrowLeft className="size-4" aria-hidden="true" />
              {t('back_to_meet')}
            </Link>
          </Button>
        )}
      </section>
    </main>
  );
}
