import { Brain, FileText, Lightbulb } from '@tuturuuu/icons/lucide';
import { cn } from '@tuturuuu/utils/format';
import type { ComponentType } from 'react';
import { CountUp } from '@/components/landing/shared/count-up';
import { RevealGroup, RevealItem } from '@/components/landing/shared/reveal';
import { SectionShell } from '@/components/landing/shared/section-shell';
import { useAboutTranslations } from './use-about-translations';

/** Static triples — Tailwind cannot resolve a class built at runtime. */
const costs: Array<{
  key: string;
  icon: ComponentType<{ className?: string }>;
  text: string;
  rule: string;
}> = [
  {
    key: 'financial',
    icon: FileText,
    text: 'text-dynamic-red',
    rule: 'via-dynamic-red/40',
  },
  {
    key: 'cognitive',
    icon: Brain,
    text: 'text-dynamic-orange',
    rule: 'via-dynamic-orange/40',
  },
  {
    key: 'innovation',
    icon: Lightbulb,
    text: 'text-dynamic-yellow',
    rule: 'via-dynamic-yellow/40',
  },
];

/** What the current way of working costs, in the three units it is paid in. */
export function CostsSection() {
  const t = useAboutTranslations();

  return (
    <SectionShell
      bloom="red"
      eyebrow={t('problem.badge')}
      index="03"
      title={`${t('problem.title.part1')} ${t('problem.title.highlight')}`}
    >
      <RevealGroup
        className="grid grid-cols-1 divide-y divide-foreground/[0.08] border-foreground/[0.08] border-y md:grid-cols-3 md:divide-x md:divide-y-0"
        stagger={0.08}
      >
        {costs.map((cost) => (
          <RevealItem key={cost.key}>
            <div className="group relative h-full overflow-hidden px-6 py-8 transition-colors duration-500 hover:bg-foreground/[0.02]">
              <span
                aria-hidden
                className={cn(
                  'pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100',
                  cost.rule
                )}
              />
              <cost.icon
                className={cn(
                  'h-4 w-4 transition-transform duration-500 group-hover:scale-110',
                  cost.text
                )}
              />
              <div
                className={cn(
                  'mt-6 font-display font-semibold text-3xl tabular-nums tracking-[-0.03em]',
                  cost.text
                )}
              >
                <CountUp value={t(`problem.${cost.key}.stat`)} />
              </div>
              <h3 className="mt-3 font-display font-semibold text-base tracking-[-0.01em]">
                {t(`problem.${cost.key}.title`)}
              </h3>
              <p className="mt-1.5 text-foreground/45 text-sm leading-relaxed">
                {t(`problem.${cost.key}.description`)}
              </p>
            </div>
          </RevealItem>
        ))}
      </RevealGroup>
    </SectionShell>
  );
}
