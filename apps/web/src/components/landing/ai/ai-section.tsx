'use client';

import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { MiraShowcase } from './mira-showcase';

export function AISection() {
  const t = useTranslations('landing.ai');

  return (
    <section className="relative px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
      <div className="mx-auto max-w-5xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.6 }}
          className="mb-12 text-center"
        >
          <h2 className="mb-4 font-bold text-3xl tracking-tight sm:text-4xl">
            {t('title')}
          </h2>
          <p className="mx-auto max-w-xl text-foreground/60 text-lg">
            {t('subtitle')}
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-50px' }}
          transition={{ delay: 0.2, duration: 0.6 }}
        >
          <MiraShowcase />
        </motion.div>
      </div>
    </section>
  );
}
