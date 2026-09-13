'use client';

import {
  CommercialComparison,
  type ComparisonCopy,
} from '@tuturuuu/ui/commercial-comparison';
import { useMessages } from 'next-intl';

export function FeatureMatrix() {
  const messages = useMessages();
  return (
    <CommercialComparison
      copy={messages.commercialComparison as unknown as ComparisonCopy}
    />
  );
}
