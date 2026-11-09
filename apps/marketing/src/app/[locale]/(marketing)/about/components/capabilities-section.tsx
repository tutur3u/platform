import {
  BarChart3,
  Folder,
  GitBranch,
  GraduationCap,
  Lock,
  Wallet,
} from '@tuturuuu/icons/lucide-static';
import { cn } from '@tuturuuu/utils/format';
import type { ComponentType } from 'react';
import { RevealGroup, RevealItem } from '@/components/landing/shared/reveal';
import { SectionShell } from '@/components/landing/shared/section-shell';
import { useAboutTranslations } from './use-about-translations';

/** Static triples — Tailwind cannot resolve a class built at runtime. */
const capabilities: Array<{
  key: string;
  icon: ComponentType<{ className?: string }>;
  text: string;
  chip: string;
  rule: string;
}> = [
  {
    key: 'finance',
    icon: Wallet,
    text: 'text-dynamic-green',
    chip: 'border-dynamic-green/25 text-dynamic-green',
    rule: 'via-dynamic-green/40',
  },
  {
    key: 'inventory',
    icon: Folder,
    text: 'text-dynamic-orange',
    chip: 'border-dynamic-orange/25 text-dynamic-orange',
    rule: 'via-dynamic-orange/40',
  },
  {
    key: 'learning',
    icon: GraduationCap,
    text: 'text-dynamic-purple',
    chip: 'border-dynamic-purple/25 text-dynamic-purple',
    rule: 'via-dynamic-purple/40',
  },
  {
    key: 'analytics',
    icon: BarChart3,
    text: 'text-dynamic-blue',
    chip: 'border-dynamic-blue/25 text-dynamic-blue',
    rule: 'via-dynamic-blue/40',
  },
  {
    key: 'security',
    icon: Lock,
    text: 'text-dynamic-red',
    chip: 'border-dynamic-red/25 text-dynamic-red',
    rule: 'via-dynamic-red/40',
  },
  {
    key: 'openSource',
    icon: GitBranch,
    text: 'text-dynamic-cyan',
    chip: 'border-dynamic-cyan/25 text-dynamic-cyan',
    rule: 'via-dynamic-cyan/40',
  },
];

const chipKeys = ['feature1', 'feature2', 'feature3'] as const;

/** What the platform covers today, one card per area of work. */
export function CapabilitiesSection() {
  const t = useAboutTranslations();

  return (
    <SectionShell
      eyebrow={t('sections.capabilities.eyebrow')}
      index="05"
      subtitle={t('features.subtitle')}
      title={`${t('features.title.part1')} ${t('features.title.highlight')}`}
    >
      <RevealGroup
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
        stagger={0.06}
      >
        {capabilities.map((capability) => (
          <RevealItem className="h-full" key={capability.key}>
            <div className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-foreground/[0.08] bg-foreground/[0.015] p-5 transition-all duration-500 hover:-translate-y-1 hover:border-foreground/15 hover:bg-foreground/[0.03]">
              <span
                aria-hidden
                className={cn(
                  'pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent to-transparent opacity-40 transition-opacity duration-500 group-hover:opacity-100',
                  capability.rule
                )}
              />
              <capability.icon
                className={cn(
                  'h-4 w-4 transition-transform duration-500 group-hover:scale-110',
                  capability.text
                )}
              />
              <h3 className="mt-4 font-display font-semibold text-[0.95rem] tracking-[-0.01em]">
                {t(`features.${capability.key}.title`)}
              </h3>
              <p className="mt-2 text-foreground/50 text-xs leading-relaxed">
                {t(`features.${capability.key}.description`)}
              </p>
              <div className="mt-4 flex flex-wrap gap-1.5 pt-1">
                {chipKeys.map((chipKey) => (
                  <span
                    className={cn(
                      'rounded-full border px-2.5 py-0.5 font-mono-ui text-[0.6rem] uppercase tracking-[0.12em]',
                      capability.chip
                    )}
                    key={chipKey}
                  >
                    {t(`features.${capability.key}.${chipKey}`)}
                  </span>
                ))}
              </div>
            </div>
          </RevealItem>
        ))}
      </RevealGroup>
    </SectionShell>
  );
}
