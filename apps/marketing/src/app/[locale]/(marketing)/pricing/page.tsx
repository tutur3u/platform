import { NO_INDEX_ROBOTS } from '@tuturuuu/utils/common/metadata';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

export const metadata: Metadata = {
  title: 'Tuturuuu Pricing',
  description:
    'Understand pricing tiers and what is included with each Tuturuuu plan.',
  robots: NO_INDEX_ROBOTS,
};

function PricingPage() {
  redirect('/?hash-nav=1#pricing');
}

export default PricingPage;
