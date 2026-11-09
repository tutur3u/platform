'use client';

import {
  Briefcase,
  Building2,
  GraduationCap,
  Heart,
  Inbox,
  Layers,
  Moon,
  Users,
} from '@tuturuuu/icons/lucide';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import type { ComponentType } from 'react';
import { RevealGroup, RevealItem } from '../shared/reveal';
import { SectionShell } from '../shared/section-shell';
import { type SurfaceAccent, SurfaceCard } from '../shared/surface-card';

/**
 * The promise, stated as what changes in the reader's week rather than what
 * the product contains. Sits between the problem and the product so a first
 * time visitor gets the payoff before the feature list.
 */
const outcomes: Array<{
  key: 'evenings' | 'dropped' | 'context' | 'head';
  icon: ComponentType<{ className?: string }>;
  accent: SurfaceAccent;
}> = [
  { key: 'evenings', icon: Moon, accent: 'purple' },
  { key: 'dropped', icon: Inbox, accent: 'green' },
  { key: 'context', icon: Layers, accent: 'blue' },
  { key: 'head', icon: Heart, accent: 'pink' },
];

const audience: Array<{
  key: 'students' | 'freelancers' | 'teams' | 'businesses';
  icon: ComponentType<{ className?: string }>;
  accent: string;
}> = [
  { key: 'students', icon: GraduationCap, accent: 'text-dynamic-orange' },
  { key: 'freelancers', icon: Briefcase, accent: 'text-dynamic-cyan' },
  { key: 'teams', icon: Users, accent: 'text-dynamic-purple' },
  { key: 'businesses', icon: Building2, accent: 'text-dynamic-green' },
];

export function OutcomesSection() {
  const t = useTranslations('landing.outcomes');

  return (
    <SectionShell
      bloom="purple"
      eyebrow={t('eyebrow')}
      id="outcomes"
      index="02"
      subtitle={t('subtitle')}
      title={t('title')}
    >
      <RevealGroup className="grid gap-3 sm:grid-cols-2" stagger={0.08}>
        {outcomes.map((outcome) => (
          <RevealItem className="h-full" key={outcome.key}>
            <SurfaceCard
              accent={outcome.accent}
              description={t(`items.${outcome.key}.description` as never)}
              icon={outcome.icon}
              size="lg"
              title={t(`items.${outcome.key}.title` as never)}
            />
          </RevealItem>
        ))}
      </RevealGroup>

      {/* Who it is for — the mission, made concrete */}
      <div className="mt-16">
        <div className="mb-7 flex items-center gap-3 px-1">
          <span className="font-mono-ui text-[0.62rem] text-foreground/35 uppercase tracking-[0.2em]">
            {t('audience.title')}
          </span>
          <span
            aria-hidden
            className="h-px flex-1 bg-gradient-to-r from-foreground/12 to-transparent"
          />
        </div>

        <RevealGroup
          className="grid grid-cols-1 divide-y divide-foreground/[0.08] border-foreground/[0.08] border-y sm:grid-cols-2 sm:divide-x lg:grid-cols-4 lg:divide-y-0"
          stagger={0.06}
        >
          {audience.map((group) => (
            <RevealItem key={group.key}>
              <div className="group h-full px-5 py-6 transition-colors duration-500 hover:bg-foreground/[0.02]">
                <group.icon
                  className={cn(
                    'h-4 w-4 transition-transform duration-500 group-hover:scale-110',
                    group.accent
                  )}
                />
                <div className="mt-4 font-display font-semibold text-base tracking-[-0.01em]">
                  {t(`audience.${group.key}.label` as never)}
                </div>
                <p className="mt-1.5 text-foreground/45 text-sm leading-relaxed">
                  {t(`audience.${group.key}.description` as never)}
                </p>
              </div>
            </RevealItem>
          ))}
        </RevealGroup>
      </div>
    </SectionShell>
  );
}
