'use client';
import { QueryProvider } from '@/components/query-provider';
import { PricingSection } from './pricing-section';
export default function PricingIsland() {
  return (
    <QueryProvider>
      <PricingSection />
    </QueryProvider>
  );
}
