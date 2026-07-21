'use client';

import { AppWindow, Brain, Clock } from '@tuturuuu/icons/lucide';
import { useTranslations } from 'next-intl';
import { RevealGroup, RevealItem } from '../shared/reveal';
import { SectionShell } from '../shared/section-shell';
import { StatCard, type StatColor } from './stat-card';

export function ProblemSection() {
  const t = useTranslations('landing.problem');

  const stats: Array<{
    icon: typeof AppWindow;
    value: string;
    label: string;
    color: StatColor;
  }> = [
    {
      icon: AppWindow,
      value: t('stats.apps.value'),
      label: t('stats.apps.label'),
      color: 'red',
    },
    {
      icon: Clock,
      value: t('stats.hours.value'),
      label: t('stats.hours.label'),
      color: 'orange',
    },
    {
      icon: Brain,
      value: t('stats.context.value'),
      label: t('stats.context.label'),
      color: 'yellow',
    },
  ];

  return (
    <SectionShell
      bloom="red"
      eyebrow={t('eyebrow')}
      index="01"
      subtitle={t('subtitle')}
      title={t('title')}
      width="narrow"
    >
      <RevealGroup className="grid gap-3 sm:grid-cols-3" stagger={0.1}>
        {stats.map((stat) => (
          <RevealItem className="h-full" key={stat.label}>
            <StatCard {...stat} />
          </RevealItem>
        ))}
      </RevealGroup>
    </SectionShell>
  );
}
