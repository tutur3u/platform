import {
  GitBranch,
  Globe,
  Rocket,
  Search,
  Settings,
  Shield,
  TrendingUp,
  Trophy,
  Users,
} from '@tuturuuu/icons/lucide-static';
import { cn } from '@tuturuuu/utils/format';
import type { ComponentType } from 'react';
import { CountUp } from '@/components/landing/shared/count-up';
import { RevealGroup, RevealItem } from '@/components/landing/shared/reveal';
import { SectionShell } from '@/components/landing/shared/section-shell';
import { useAboutTranslations } from './use-about-translations';

/** Static triples — Tailwind cannot resolve a class built at runtime. */
const stats: Array<{
  key: string;
  icon: ComponentType<{ className?: string }>;
  text: string;
}> = [
  { key: 'openSource', icon: Users, text: 'text-dynamic-blue' },
  { key: 'contributions', icon: GitBranch, text: 'text-dynamic-green' },
  { key: 'milestones', icon: Trophy, text: 'text-dynamic-yellow' },
];

const values: Array<{
  key: string;
  icon: ComponentType<{ className?: string }>;
}> = [
  { key: 'builders', icon: Settings },
  { key: 'optimism', icon: TrendingUp },
  { key: 'ownership', icon: Shield },
  { key: 'transparency', icon: Search },
  { key: 'vietnam', icon: Globe },
  { key: 'innovation', icon: Rocket },
];

/** Who builds this, and the working culture behind it. */
export function CommunitySection() {
  const t = useAboutTranslations();

  return (
    <SectionShell
      bloom="green"
      eyebrow={t('sections.community.eyebrow')}
      index="08"
      subtitle={t('community.subtitle')}
      title={`${t('community.title.part1')} ${t('community.title.highlight')}`}
    >
      <RevealGroup
        className="grid grid-cols-1 divide-y divide-foreground/[0.08] border-foreground/[0.08] border-y md:grid-cols-3 md:divide-x md:divide-y-0"
        stagger={0.08}
      >
        {stats.map((stat) => (
          <RevealItem key={stat.key}>
            <div className="group h-full px-6 py-8 transition-colors duration-500 hover:bg-foreground/[0.02]">
              <stat.icon
                className={cn(
                  'h-4 w-4 transition-transform duration-500 group-hover:scale-110',
                  stat.text
                )}
              />
              <div
                className={cn(
                  'mt-5 font-display font-semibold text-4xl tabular-nums tracking-[-0.03em]',
                  stat.text
                )}
              >
                <CountUp value={t(`community.${stat.key}.value`)} />
              </div>
              <h3 className="mt-3 font-display font-semibold text-base tracking-[-0.01em]">
                {t(`community.${stat.key}.title`)}
              </h3>
              <p className="mt-1.5 text-foreground/45 text-sm leading-relaxed">
                {t(`community.${stat.key}.description`)}
              </p>
            </div>
          </RevealItem>
        ))}
      </RevealGroup>

      <div className="mt-16">
        <div className="mb-7 flex items-center gap-3 px-1">
          <span className="font-mono-ui text-[0.62rem] text-foreground/35 uppercase tracking-[0.2em]">
            {t('community.culture.title')}
          </span>
          <span
            aria-hidden
            className="h-px flex-1 bg-gradient-to-r from-foreground/12 to-transparent"
          />
        </div>

        <p className="mb-7 max-w-xl px-1 text-foreground/50 text-sm leading-relaxed">
          {t('community.culture.subtitle')}
        </p>

        <RevealGroup
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
          stagger={0.05}
        >
          {values.map((value) => (
            <RevealItem className="h-full" key={value.key}>
              <div className="group relative flex h-full items-start gap-3 overflow-hidden rounded-2xl border border-foreground/[0.08] bg-foreground/[0.015] p-4 transition-colors duration-500 hover:border-foreground/15 hover:bg-foreground/[0.03]">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-foreground/10 bg-foreground/[0.03] text-dynamic-purple transition-transform duration-500 group-hover:scale-105">
                  <value.icon className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-display font-semibold text-[0.95rem] tracking-[-0.01em]">
                    {t(`community.culture.${value.key}.title`)}
                  </span>
                  <span className="mt-1.5 block text-foreground/50 text-xs leading-relaxed">
                    {t(`community.culture.${value.key}.description`)}
                  </span>
                </span>
              </div>
            </RevealItem>
          ))}
        </RevealGroup>
      </div>
    </SectionShell>
  );
}
