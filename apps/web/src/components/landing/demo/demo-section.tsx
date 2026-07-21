'use client';

import { Sparkles } from '@tuturuuu/icons/lucide';
import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
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
          {t('video.badge')}
        </>
      }
      id="demo"
      index="03"
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
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        transition={{ duration: 0.6 }}
        viewport={{ once: true, margin: '-50px' }}
        whileInView={{ opacity: 1, y: 0 }}
      >
        <Panel className="p-1.5 sm:p-2">
          <DemoTabs />
        </Panel>
      </motion.div>
    </SectionShell>
  );
}
