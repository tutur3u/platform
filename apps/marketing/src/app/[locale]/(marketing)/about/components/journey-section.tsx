import {
  Building2,
  Check,
  Lightbulb,
  Rocket,
  Sparkles,
} from '@tuturuuu/icons/lucide-static';
import { cn } from '@tuturuuu/utils/format';
import type { ComponentType } from 'react';
import { RevealGroup, RevealItem } from '@/components/landing/shared/reveal';
import { SectionShell } from '@/components/landing/shared/section-shell';
import { useAboutTranslations } from './use-about-translations';

/** Static triples — Tailwind cannot resolve a class built at runtime. */
const milestones: Array<{
  key: string;
  icon: ComponentType<{ className?: string }>;
  achievements: number;
  text: string;
  border: string;
  surface: string;
}> = [
  {
    key: 'foundation',
    icon: Lightbulb,
    achievements: 2,
    text: 'text-dynamic-yellow',
    border: 'border-dynamic-yellow/25',
    surface: 'bg-dynamic-yellow/10',
  },
  {
    key: 'building',
    icon: Rocket,
    achievements: 4,
    text: 'text-dynamic-blue',
    border: 'border-dynamic-blue/25',
    surface: 'bg-dynamic-blue/10',
  },
  {
    key: 'launch',
    icon: Building2,
    achievements: 2,
    text: 'text-dynamic-purple',
    border: 'border-dynamic-purple/25',
    surface: 'bg-dynamic-purple/10',
  },
  {
    key: 'evolution',
    icon: Sparkles,
    achievements: 3,
    text: 'text-dynamic-pink',
    border: 'border-dynamic-pink/25',
    surface: 'bg-dynamic-pink/10',
  },
];

/** One rail, four stops. A vertical list reads better than an alternating grid. */
export function JourneySection() {
  const t = useAboutTranslations();

  return (
    <SectionShell
      eyebrow={t('sections.journey.eyebrow')}
      index="07"
      subtitle={t('timeline.subtitle')}
      title={`${t('timeline.title.part1')} ${t('timeline.title.highlight')}`}
      width="narrow"
    >
      <div className="relative">
        <span
          aria-hidden
          className="pointer-events-none absolute top-2 bottom-2 left-[1.1875rem] w-px bg-gradient-to-b from-transparent via-foreground/12 to-transparent sm:left-[1.4375rem]"
        />

        <RevealGroup className="grid gap-4" stagger={0.08}>
          {milestones.map((milestone) => (
            <RevealItem key={milestone.key}>
              <div className="relative flex gap-5 sm:gap-7">
                <span
                  className={cn(
                    'relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border bg-background sm:h-12 sm:w-12',
                    milestone.border
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      'absolute inset-1 rounded-full',
                      milestone.surface
                    )}
                  />
                  <milestone.icon
                    className={cn('relative h-4 w-4', milestone.text)}
                  />
                </span>

                <div className="group relative min-w-0 flex-1 overflow-hidden rounded-2xl border border-foreground/[0.08] bg-foreground/[0.015] p-5 transition-colors duration-500 hover:border-foreground/15 hover:bg-foreground/[0.03] sm:p-6">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono-ui text-[0.62rem] uppercase tracking-[0.2em]">
                    <span className={milestone.text}>
                      {t(`timeline.${milestone.key}.phase`)}
                    </span>
                    <span
                      aria-hidden
                      className="h-px w-6 bg-gradient-to-r from-foreground/20 to-transparent"
                    />
                    <span className="text-foreground/35 tabular-nums">
                      {t(`timeline.${milestone.key}.period`)}
                    </span>
                  </div>

                  <h3 className="mt-3 font-display font-semibold text-xl tracking-[-0.02em]">
                    {t(`timeline.${milestone.key}.title`)}
                  </h3>
                  <p className="mt-2 text-foreground/50 text-sm leading-relaxed">
                    {t(`timeline.${milestone.key}.description`)}
                  </p>

                  <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                    {Array.from(
                      { length: milestone.achievements },
                      (_, index) => (
                        <li
                          className="flex items-start gap-2 text-foreground/55 text-xs"
                          key={`${milestone.key}-${index}`}
                        >
                          <Check
                            className={cn(
                              'mt-0.5 h-3 w-3 shrink-0',
                              milestone.text
                            )}
                          />
                          {t(
                            `timeline.${milestone.key}.achievement${index + 1}`
                          )}
                        </li>
                      )
                    )}
                  </ul>
                </div>
              </div>
            </RevealItem>
          ))}
        </RevealGroup>
      </div>
    </SectionShell>
  );
}
