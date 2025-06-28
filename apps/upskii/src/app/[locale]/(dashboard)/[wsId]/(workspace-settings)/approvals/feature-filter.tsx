'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import {
  getRequestableFeature,
  getRequestableFeatureKeys,
} from '@tuturuuu/utils/feature-flags/requestable-features';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';

interface FeatureFilterProps {
  currentFeature?: string;
}

export function FeatureFilter({ currentFeature }: FeatureFilterProps) {
  const t = useTranslations('approval-data-table');
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleFeatureChange = (feature: string) => {
    const params = new URLSearchParams(searchParams);

    if (feature === 'all') {
      params.delete('feature');
    } else {
      params.set('feature', feature);
    }

    // Reset to first page when filtering
    params.delete('page');

    router.push(`?${params.toString()}`);
  };

  const availableFeatures = getRequestableFeatureKeys();

  return (
    <Select value={currentFeature || 'all'} onValueChange={handleFeatureChange}>
      <SelectTrigger className="w-[180px]">
        <SelectValue placeholder={t('filter-by-feature')} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{t('all-features')}</SelectItem>
        {availableFeatures.map((featureKey) => {
          const feature = getRequestableFeature(featureKey);
          return (
            <SelectItem key={featureKey} value={featureKey}>
              {feature.name}
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
