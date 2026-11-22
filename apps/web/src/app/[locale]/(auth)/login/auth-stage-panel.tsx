'use client';

import { TUTURUUU_LOCAL_LOGO_URL } from '@tuturuuu/ui/custom/tuturuuu-logo';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { SorbetBowlIllustration } from './sorbet-bowl-illustration';

const CHIPS = [
  {
    className:
      'auth-float bg-calendar-bg-blue text-dynamic-blue left-9 top-[70px]',
    key: 'stage_chip_calendar',
  },
  {
    className:
      'auth-float-2 bg-calendar-bg-green text-dynamic-green right-[30px] top-[120px]',
    key: 'stage_chip_tasks',
  },
  {
    className:
      'auth-float-2 bg-calendar-bg-purple text-dynamic-purple bottom-[60px] left-[60px]',
    key: 'stage_chip_mira',
  },
  {
    className:
      'auth-float bg-calendar-bg-orange text-dynamic-orange right-14 bottom-[34px]',
    key: 'stage_chip_chat',
  },
] as const;

/**
 * The decorative sign-in stage: a full-height panel beside the form on
 * desktop, a top band with the headline on tablets and a compact hero on
 * phones. It holds no controls and is hidden from assistive technology; the
 * form column carries the page heading.
 */
export function AuthStagePanel() {
  const t = useTranslations('login');

  return (
    <section
      aria-hidden="true"
      className="relative flex h-44 shrink-0 items-center justify-center overflow-hidden rounded-[28px] bg-root-background md:h-80 md:justify-start md:gap-6 md:px-10 lg:h-auto lg:flex-col lg:items-stretch lg:justify-start lg:gap-0 lg:px-10 lg:py-8"
      data-testid="auth-stage"
    >
      <div className="hidden items-center gap-2.5 lg:flex">
        <span
          className="block size-7 bg-center bg-contain bg-no-repeat"
          style={{ backgroundImage: `url(${TUTURUUU_LOCAL_LOGO_URL})` }}
        />
        <span className="font-extrabold text-lg tracking-tight">Tuturuuu</span>
      </div>
      <div className="relative flex shrink-0 items-center justify-center lg:flex-1">
        <SorbetBowlIllustration className="w-40 md:w-64 lg:w-[380px]" />
        {CHIPS.map((chip) => (
          <span
            className={cn(
              'absolute hidden h-7 items-center rounded-full px-3 font-bold text-xs lg:inline-flex',
              chip.className
            )}
            key={chip.key}
          >
            {t(chip.key)}
          </span>
        ))}
      </div>
      <div className="hidden min-w-0 flex-col gap-2 md:flex lg:max-w-[460px]">
        <p className="text-balance font-extrabold text-4xl leading-[1.05] tracking-[-0.025em] lg:text-[40px]">
          {t('stage_headline')}
        </p>
        <p className="text-muted-foreground text-[15px] leading-relaxed">
          {t('stage_subline')}
        </p>
      </div>
    </section>
  );
}
