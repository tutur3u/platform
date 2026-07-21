'use client';

import { Sparkles } from '@tuturuuu/icons/lucide';
import { useTranslations } from 'next-intl';
import { Grain } from '../shared/atmosphere';
import { Reveal } from '../shared/reveal';
import { Panel, SectionShell } from '../shared/section-shell';
import { DemoTabs } from './demo-tabs';

export function DemoSection() {
  const t = useTranslations('landing.demo');

  return (
    <SectionShell
      bloom="cyan"
      eyebrow={
        <>
          <Sparkles className="h-3 w-3 text-dynamic-blue" />
          {t('badge')}
        </>
      }
      id="demo"
      index="04"
      subtitle={t('subtitle')}
      title={
        <>
          {t('title.part1')}{' '}
          <span className="bg-[linear-gradient(100deg,var(--blue),var(--cyan))] bg-clip-text text-transparent">
            {t('title.highlight')}
          </span>
        </>
      }
    >
      <Reveal blur direction="scale">
        <Panel className="p-1.5 sm:p-2">
          <Grain className="rounded-3xl" />
          <DemoTabs />
        </Panel>
      </Reveal>
    </SectionShell>
  );
}
