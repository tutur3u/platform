'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import FeatureToggle from '@/components/feature-toggle';

export default function FeatureToggles() {
  const t = useTranslations('sidebar_tabs');

  const [features, setFeatures] = useState<{
    [key: string]: boolean;
  }>({});

  const isFeatureEnabled = (feature: string) => {
    return features?.[feature] ?? false;
  };

  const toggleFeature = (feature: string) => {
    setFeatures((features) => ({
      ...features,
      [feature]: !features[feature],
    }));
  };

  const availableFeatures = [
    'documents',
    'users',
    'inventory',
    'finance',
  ] as const;

  return availableFeatures.map((feature) => (
    <FeatureToggle
      key={feature}
      label={t(feature)}
      checked={isFeatureEnabled(feature)}
      onCheck={() => toggleFeature(feature)}
    />
  ));
}
