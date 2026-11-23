'use client';

import {
  Calendar,
  CheckCircle2,
  ChevronRight,
  Sparkles,
} from '@tuturuuu/icons/lucide-static';
import { Button } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { type ReactNode, useEffect, useRef } from 'react';
import { Link } from '@/i18n/routing';
import { DoneScene } from './onboarding-illustrations';
import { FOCUS_RING } from './welcome-controls';

type NextStep = {
  chip: string;
  href: string;
  icon: ReactNode;
  key: 'next_calendar' | 'next_mira' | 'next_task';
  /** The app lives on its own origin, so this is a plain link. */
  external: boolean;
};

const ROW =
  'flex min-h-14 items-center gap-3 rounded-2xl border bg-card px-3.5 py-2.5 transition-colors hover:bg-accent motion-reduce:transition-none';

/**
 * The closing screen: a greeting, three good first moves linking to routes
 * that already exist, and the way into the workspace.
 */
export function WelcomeDone({
  calendarOrigin,
  name,
  tasksOrigin,
  workspaceName,
  workspaceSlug,
}: {
  calendarOrigin: string;
  name: string;
  tasksOrigin: string;
  workspaceName: string | null;
  workspaceSlug: string;
}) {
  const t = useTranslations('onboarding_flow');
  const headingRef = useRef<HTMLHeadingElement>(null);

  // The closing screen replaces the step, so focus follows to its heading.
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const steps: NextStep[] = [
    {
      chip: 'bg-calendar-bg-green text-dynamic-green',
      external: true,
      href: `${tasksOrigin}/${workspaceSlug}/tasks`,
      icon: <CheckCircle2 aria-hidden className="size-[18px]" />,
      key: 'next_task',
    },
    {
      chip: 'bg-calendar-bg-blue text-dynamic-blue',
      external: true,
      href: `${calendarOrigin}/${workspaceSlug}`,
      icon: <Calendar aria-hidden className="size-[18px]" />,
      key: 'next_calendar',
    },
    {
      chip: 'bg-calendar-bg-purple text-dynamic-purple',
      external: false,
      href: `/${workspaceSlug}`,
      icon: <Sparkles aria-hidden className="size-[18px]" />,
      key: 'next_mira',
    },
  ];

  return (
    <main className="flex min-h-dvh flex-col items-center bg-root-background px-4 py-8 text-foreground sm:px-7 sm:py-10">
      <DoneScene className="w-44 sm:w-[220px]" />
      <div className="mt-3 flex flex-col gap-1.5 text-center">
        <h1
          className="text-balance font-extrabold text-3xl leading-tight tracking-[-0.025em] focus:outline-none sm:text-4xl"
          ref={headingRef}
          tabIndex={-1}
        >
          {name ? t('done_title', { name }) : t('done_title_anonymous')}
        </h1>
        <p className="text-muted-foreground">
          {workspaceName
            ? t('done_subtitle_workspace', { workspace: workspaceName })
            : t('done_subtitle')}
        </p>
      </div>
      <div className="mt-6 flex w-full max-w-[500px] flex-col gap-2.5">
        {steps.map((step) => {
          const content = (
            <>
              <span
                aria-hidden="true"
                className={cn(
                  'flex size-9 shrink-0 items-center justify-center rounded-xl',
                  step.chip
                )}
              >
                {step.icon}
              </span>
              <span className="flex-1 font-semibold text-sm">
                {t(step.key)}
              </span>
              <ChevronRight
                aria-hidden
                className="size-4 text-muted-foreground"
              />
            </>
          );
          return step.external ? (
            <a className={cn(ROW, FOCUS_RING)} href={step.href} key={step.key}>
              {content}
            </a>
          ) : (
            <Link
              className={cn(ROW, FOCUS_RING)}
              href={step.href}
              key={step.key}
            >
              {content}
            </Link>
          );
        })}
        <Button asChild className="mt-2 h-12 rounded-full">
          <Link href={`/${workspaceSlug}`}>{t('go_to_workspace')}</Link>
        </Button>
        <p className="text-center text-muted-foreground text-xs">
          {t('replay_hint')}
        </p>
      </div>
    </main>
  );
}
