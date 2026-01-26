'use client';

import {
  Calendar,
  CheckCircle2,
  GraduationCap,
  MessageSquare,
  Users,
  Wallet,
} from '@tuturuuu/icons';
import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { FeatureCard } from './feature-card';

export function FeaturesBento() {
  const t = useTranslations('landing.features');

  const products = [
    {
      icon: Calendar,
      appKey: 'tuplan',
      color: 'blue',
      size: 'large',
    },
    {
      icon: CheckCircle2,
      appKey: 'tudo',
      color: 'green',
      size: 'large',
    },
    {
      icon: Users,
      appKey: 'tumeet',
      color: 'purple',
      size: 'medium',
    },
    {
      icon: MessageSquare,
      appKey: 'tuchat',
      color: 'cyan',
      size: 'medium',
    },
    {
      icon: Wallet,
      appKey: 'tufinance',
      color: 'green',
      size: 'medium',
    },
    {
      icon: GraduationCap,
      appKey: 'nova',
      color: 'orange',
      size: 'large',
    },
  ] as const;

  return (
    <section
      id="features"
      className="relative scroll-mt-20 px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24"
    >
      <div className="mx-auto max-w-6xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.6 }}
          className="mb-12 text-center sm:mb-16"
        >
          <h2 className="mb-4 font-bold text-3xl tracking-tight sm:text-4xl">
            {t('title')}
          </h2>
          <p className="mx-auto max-w-xl text-foreground/60 text-lg">
            {t('subtitle')}
          </p>
        </motion.div>

        {/* Bento Grid Layout */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((product, index) => (
            <motion.div
              key={product.appKey}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-50px' }}
              transition={{ delay: index * 0.08, duration: 0.5 }}
              className={
                product.size === 'large' ? 'sm:col-span-1' : 'sm:col-span-1'
              }
            >
              <FeatureCard
                icon={product.icon}
                title={t(`apps.${product.appKey}.title` as any)}
                subtitle={t(`apps.${product.appKey}.subtitle` as any)}
                description={t(`apps.${product.appKey}.description` as any)}
                color={product.color}
              />
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
