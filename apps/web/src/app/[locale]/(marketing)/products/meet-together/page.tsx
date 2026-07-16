import { NO_INDEX_ROBOTS } from '@tuturuuu/utils/common/metadata';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

export const metadata: Metadata = {
  title: 'Meet Together Product',
  description:
    'Plan agendas and run meetings end-to-end with Tuturuuu Meet Together.',
  robots: NO_INDEX_ROBOTS,
};

export default function MeetTogetherProductPage() {
  redirect('/meet-together');
}
