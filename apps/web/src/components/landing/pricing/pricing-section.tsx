'use client';

import { Building2, Crown, Rocket, Sparkles } from '@tuturuuu/icons';
import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { FeatureMatrix } from './feature-matrix';
import { PaygBanner } from './payg-banner';
import { PricingCard } from './pricing-card';
import { PricingToggle } from './pricing-toggle';

export function PricingSection() {
  const [isYearly, setIsYearly] = useState(false);
  const t = useTranslations('landing.pricing');

  const tiers = [
    {
      id: 'free',
      icon: Rocket,
      name: t('tiers.free.name'),
      price: { monthly: '$0', yearly: '$0' },
      period: t('tiers.free.period'),
      description: t('tiers.free.description'),
      cta: t('tiers.free.cta'),
      ctaVariant: 'outline' as const,
      features: [
        t('tiers.free.features.0'),
        t('tiers.free.features.1'),
        t('tiers.free.features.2'),
        t('tiers.free.features.3'),
        t('tiers.free.features.4'),
      ],
      color: 'green' as const,
    },
    {
      id: 'plus',
      icon: Sparkles,
      name: t('tiers.plus.name'),
      price: { monthly: '$8', yearly: '$80' },
      period: {
        monthly: t('tiers.plus.period.monthly'),
        yearly: t('tiers.plus.period.yearly'),
      },
      badge: t('tiers.plus.badge'),
      description: t('tiers.plus.description'),
      cta: t('tiers.plus.cta'),
      ctaVariant: 'default' as const,
      features: [
        t('tiers.plus.features.0'),
        t('tiers.plus.features.1'),
        t('tiers.plus.features.2'),
        t('tiers.plus.features.3'),
        t('tiers.plus.features.4'),
        t('tiers.plus.features.5'),
        t('tiers.plus.features.6'),
      ],
      color: 'blue' as const,
      highlighted: true,
    },
    {
      id: 'pro',
      icon: Crown,
      name: t('tiers.pro.name'),
      price: { monthly: '$15', yearly: '$150' },
      period: {
        monthly: t('tiers.pro.period.monthly'),
        yearly: t('tiers.pro.period.yearly'),
      },
      badge: t('tiers.pro.badge'),
      description: t('tiers.pro.description'),
      cta: t('tiers.pro.cta'),
      ctaVariant: 'default' as const,
      features: [
        t('tiers.pro.features.0'),
        t('tiers.pro.features.1'),
        t('tiers.pro.features.2'),
        t('tiers.pro.features.3'),
        t('tiers.pro.features.4'),
      ],
      color: 'purple' as const,
    },
    {
      id: 'enterprise',
      icon: Building2,
      name: t('tiers.enterprise.name'),
      price: {
        monthly: t('tiers.enterprise.price'),
        yearly: t('tiers.enterprise.price'),
      },
      description: t('tiers.enterprise.description'),
      cta: t('tiers.enterprise.cta'),
      ctaVariant: 'outline' as const,
      features: [
        t('tiers.enterprise.features.0'),
        t('tiers.enterprise.features.1'),
        t('tiers.enterprise.features.2'),
        t('tiers.enterprise.features.3'),
        t('tiers.enterprise.features.4'),
      ],
      color: 'orange' as const,
    },
  ];

  return (
    <section
      id="pricing"
      className="relative scroll-mt-20 px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24"
    >
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.6 }}
          className="mb-10 text-center sm:mb-12"
        >
          <h2 className="mb-3 font-bold text-3xl tracking-tight sm:text-4xl">
            {t('title')}
          </h2>
          <p className="mx-auto mb-6 max-w-xl text-foreground/60 text-lg">
            {t('subtitle')}
          </p>

          {/* Billing Toggle */}
          <PricingToggle isYearly={isYearly} onToggle={setIsYearly} />
        </motion.div>

        {/* Pricing Cards Grid */}
        <div className="mb-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {tiers.map((tier, index) => (
            <motion.div
              key={tier.id}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-50px' }}
              transition={{ delay: index * 0.1, duration: 0.5 }}
            >
              <motion.div
                animate={{
                  scale: [1, 1.02, 1],
                }}
                transition={{
                  duration: 0.3,
                  ease: 'easeOut',
                }}
                key={`${tier.id}-${isYearly}`}
              >
                <PricingCard
                  icon={tier.icon}
                  name={tier.name}
                  price={isYearly ? tier.price.yearly : tier.price.monthly}
                  period={
                    typeof tier.period === 'object'
                      ? isYearly
                        ? tier.period.yearly
                        : tier.period.monthly
                      : tier.period
                  }
                  badge={tier.badge}
                  description={tier.description}
                  cta={tier.cta}
                  ctaVariant={tier.ctaVariant}
                  features={tier.features}
                  color={tier.color}
                  highlighted={tier.highlighted}
                  isEnterprise={tier.id === 'enterprise'}
                  isFree={tier.id === 'free'}
                />
              </motion.div>
            </motion.div>
          ))}
        </div>

        {/* Feature Comparison */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-50px' }}
          transition={{ delay: 0.4, duration: 0.6 }}
        >
          <FeatureMatrix />
        </motion.div>

        {/* Pay As You Go Banner */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-50px' }}
          transition={{ delay: 0.5, duration: 0.6 }}
          className="mt-8"
        >
          <PaygBanner />
        </motion.div>
      </div>
    </section>
  );
}
