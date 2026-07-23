import { AppWindow, Brain, Clock } from '@tuturuuu/icons/lucide';
import { useTranslations } from 'next-intl';
import { Reveal, RevealGroup, RevealItem } from '../shared/reveal';
import { SectionShell } from '../shared/section-shell';
import { BLOCK_COUNT, DayStrip, FRAGMENT_COUNT } from './day-strip';
import { type Stat, StatRail } from './stat-rail';
import {
  DuplicateFigure,
  GlueFigure,
  StaleFigure,
  SymptomCard,
} from './symptom-cards';

/**
 * The problem, argued in three moves: what a day looks like now, the three
 * ways that shows up in the week, and what it costs.
 */
export function ProblemSection() {
  const t = useTranslations('landing.problem');

  const stats: Stat[] = [
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

  const symptoms = [
    {
      key: 'duplicated',
      tone: 'red' as const,
      figure: <DuplicateFigure />,
    },
    {
      key: 'stale',
      tone: 'orange' as const,
      figure: <StaleFigure />,
    },
    {
      key: 'glue',
      tone: 'yellow' as const,
      figure: <GlueFigure />,
    },
  ];

  return (
    <SectionShell
      bloom="red"
      eyebrow={t('eyebrow')}
      index="01"
      subtitle={t('subtitle')}
      title={t('title')}
    >
      <Reveal>
        <DayStrip
          consolidatedLabel={t('day.consolidated.label')}
          consolidatedMeta={t('day.consolidated.meta', { count: BLOCK_COUNT })}
          fragmentedLabel={t('day.fragmented.label')}
          fragmentedMeta={t('day.fragmented.meta', { count: FRAGMENT_COUNT })}
        />
      </Reveal>

      <RevealGroup className="mb-3 grid gap-3 sm:grid-cols-3" stagger={0.08}>
        {symptoms.map((symptom, index) => (
          <RevealItem className="h-full" key={symptom.key}>
            <SymptomCard
              description={t(`symptoms.${symptom.key}.description` as never)}
              figure={symptom.figure}
              index={`0${index + 1}`}
              title={t(`symptoms.${symptom.key}.title` as never)}
              tone={symptom.tone}
            />
          </RevealItem>
        ))}
      </RevealGroup>

      <Reveal delay={0.1}>
        <StatRail stats={stats} />
      </Reveal>
    </SectionShell>
  );
}
