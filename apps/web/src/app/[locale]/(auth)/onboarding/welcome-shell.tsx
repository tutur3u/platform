'use client';

import { ChevronLeft } from '@tuturuuu/icons/lucide-static';
import { TUTURUUU_LOCAL_LOGO_URL } from '@tuturuuu/ui/custom/tuturuuu-logo';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { FOCUS_RING, HIT_AREA } from './welcome-controls';
import { WELCOME_STEPS, type WelcomeStep } from './welcome-model';

const GHOST_BUTTON = cn(
  HIT_AREA,
  FOCUS_RING,
  'inline-flex h-8 items-center gap-1 rounded-full px-3 font-bold text-muted-foreground text-sm transition-colors hover:text-foreground disabled:opacity-50 motion-reduce:transition-none'
);

/**
 * The frame of the welcome flow: a top bar with the step, a three-segment bar
 * and "Skip for now", then a centred 500px card on the ground tone.
 */
export function WelcomeShell({
  busy,
  children,
  footer,
  onBack,
  onSkip,
  step,
}: {
  busy: boolean;
  children: ReactNode;
  footer?: ReactNode;
  onBack: (() => void) | null;
  onSkip: () => void;
  step: WelcomeStep;
}) {
  const t = useTranslations('onboarding_flow');
  const index = WELCOME_STEPS.indexOf(step);

  return (
    <div className="flex min-h-dvh flex-col bg-root-background px-4 py-5 text-foreground sm:px-7">
      <header className="mx-auto grid w-full max-w-[860px] grid-cols-[1fr_auto_1fr] items-center gap-3">
        <div className="flex items-center justify-start">
          {onBack ? (
            <button
              className={GHOST_BUTTON}
              disabled={busy}
              onClick={onBack}
              type="button"
            >
              <ChevronLeft aria-hidden className="size-4" />
              {t('back')}
            </button>
          ) : (
            <span
              aria-label="Tuturuuu"
              className="block size-7 bg-center bg-contain bg-no-repeat"
              role="img"
              style={{ backgroundImage: `url(${TUTURUUU_LOCAL_LOGO_URL})` }}
            />
          )}
        </div>
        <div className="flex w-32 flex-col gap-1.5 sm:w-52">
          <span className="text-center text-muted-foreground text-xs">
            {t('step_of', { current: index + 1, total: WELCOME_STEPS.length })}
          </span>
          <div aria-hidden="true" className="flex gap-1.5">
            {WELCOME_STEPS.map((id, position) => (
              <i
                className={cn(
                  'h-1.5 flex-1 rounded-full',
                  position <= index ? 'bg-primary' : 'bg-secondary'
                )}
                key={id}
              />
            ))}
          </div>
        </div>
        <div className="flex items-center justify-end">
          <button
            className={GHOST_BUTTON}
            disabled={busy}
            onClick={onSkip}
            type="button"
          >
            {t('skip_for_now')}
          </button>
        </div>
      </header>

      <main className="mx-auto mt-6 flex w-full max-w-[500px] flex-1 flex-col gap-4 pb-8">
        <div
          className="fade-in-0 slide-in-from-bottom-2 flex animate-in flex-col gap-5 rounded-[28px] border bg-card p-5 duration-300 sm:p-7 motion-reduce:animate-none"
          data-slot="card"
        >
          {children}
        </div>
        {footer}
      </main>
    </div>
  );
}

/** The heading row every step shares: a scene beside a title and a line. */
export function StepHeading({
  scene,
  subtitle,
  title,
}: {
  scene: ReactNode;
  subtitle: string;
  title: string;
}) {
  return (
    <div className="flex items-center gap-4">
      {scene}
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="text-balance font-extrabold text-2xl leading-tight tracking-[-0.02em]">
          {title}
        </h1>
        <p className="text-muted-foreground text-sm">{subtitle}</p>
      </div>
    </div>
  );
}
