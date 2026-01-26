'use client';

import { Sparkles } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { DemoTabs } from './demo-tabs';

export function DemoSection() {
  const t = useTranslations('landing.demo');

  return (
    <section
      id="demo"
      className="relative scroll-mt-20 px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24"
    >
      <div className="mx-auto max-w-6xl">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.6 }}
          className="mb-10 text-center sm:mb-12"
        >
          <Badge
            variant="secondary"
            className="mb-4 gap-1.5 border-dynamic-blue/30 bg-dynamic-blue/10 text-dynamic-blue"
          >
            <Sparkles className="h-3.5 w-3.5" />
            {t('video.badge')}
          </Badge>
          <h2 className="mb-4 font-bold text-3xl tracking-tight sm:text-4xl">
            {t('title.part1')}{' '}
            <span className="text-dynamic-blue">{t('title.highlight')}</span>
          </h2>
          <p className="mx-auto max-w-xl text-foreground/60 text-lg">
            {t('subtitle')}
          </p>
        </motion.div>

        {/* Interactive Demos */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-50px' }}
          transition={{ delay: 0.2, duration: 0.6 }}
        >
          <DemoTabs />
        </motion.div>
      </div>
    </section>
  );
}
