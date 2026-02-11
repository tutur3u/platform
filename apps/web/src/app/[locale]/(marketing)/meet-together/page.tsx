import { MeetTogetherPage } from '@tuturuuu/ui/legacy/meet/page';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Meet Together Overview',
  description:
    'See how Tuturuuu Meet Together streamlines collaborative meetings.',
};

interface TumeetPageProps {
  searchParams: Promise<{
    page?: string;
    pageSize?: string;
    search?: string;
  }>;
}

export default async function TumeetPage({ searchParams }: TumeetPageProps) {
  return <MeetTogetherPage searchParams={searchParams} />;
}
