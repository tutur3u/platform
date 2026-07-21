'use client';

import {
  Building2,
  Crown,
  Rocket,
  Sparkles,
  Tag,
} from '@tuturuuu/icons/lucide';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Reveal, RevealGroup, RevealItem } from '../shared/reveal';
import { SectionShell } from '../shared/section-shell';
import { FeatureMatrix } from './feature-matrix';
import { PaygBanner } from './payg-banner';
import { PricingCard } from './pricing-card';
import { PricingToggle } from './pricing-toggle';

export function PricingSection() {
  const [isYearly, setIsYearly] = useState(false);
  const t = useTranslations('landing.pricing');

  /** Shared vocabulary between the cards and the comparison matrix. */
  const soonLabel = t('matrix.values.soon');

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
        t('tiers.free.features.5'),
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
        t('tiers.pro.features.5'),
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
    <SectionShell
      bloom="green"
      eyebrow={
        <>
          <Tag className="h-3 w-3 text-dynamic-green" />
          {t('eyebrow')}
        </>
      }
      id="pricing"
      index="07"
      subtitle={t('subtitle')}
      title={t('title')}
      width="wide"
    >
      {/* Billing toggle */}
      <Reveal className="-mt-4 mb-12 flex justify-center" duration={0.5}>
        <PricingToggle isYearly={isYearly} onToggle={setIsYearly} />
      </Reveal>

      {/* Tier grid */}
      <RevealGroup className="mb-14 grid items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiers.map((tier) => (
          <RevealItem className="h-full" key={tier.id}>
            <PricingCard
              badge={tier.badge}
              color={tier.color}
              cta={tier.cta}
              ctaVariant={tier.ctaVariant}
              description={tier.description}
              features={tier.features}
              highlighted={tier.highlighted}
              icon={tier.icon}
              isEnterprise={tier.id === 'enterprise'}
              isFree={tier.id === 'free'}
              name={tier.name}
              period={
                typeof tier.period === 'object'
                  ? isYearly
                    ? tier.period.yearly
                    : tier.period.monthly
                  : tier.period
              }
              price={isYearly ? tier.price.yearly : tier.price.monthly}
              soonLabel={soonLabel}
            />
          </RevealItem>
        ))}
      </RevealGroup>

      {/* Feature comparison */}
      <Reveal>
        <FeatureMatrix />
      </Reveal>

      {/* Usage-based add-ons */}
      <Reveal className="mt-10" delay={0.05}>
        <PaygBanner />
      </Reveal>
    </SectionShell>
  );
}
