'use client';

import { Bot } from '@tuturuuu/icons/lucide';
import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { SectionShell } from '../shared/section-shell';
import { MiraShowcase } from './mira-showcase';

export function AISection() {
  const t = useTranslations('landing.ai');

  return (
    <SectionShell
      bloom="purple"
      eyebrow={
        <>
          <Bot className="h-3 w-3 text-dynamic-purple" />
          {t('eyebrow')}
        </>
      }
      index="04"
      subtitle={t('subtitle')}
      title={t('title')}
      width="narrow"
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        transition={{ duration: 0.6 }}
        viewport={{ once: true, margin: '-50px' }}
        whileInView={{ opacity: 1, y: 0 }}
      >
        <MiraShowcase />
      </motion.div>
    </SectionShell>
  );
}
