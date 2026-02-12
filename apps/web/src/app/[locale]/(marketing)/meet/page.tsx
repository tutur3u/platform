import { MeetTogetherPage } from '@tuturuuu/ui/legacy/meet/page';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Tuturuuu Meet Overview',
  description:
    'See what makes Tuturuuu Meet the intelligent meeting companion from Tuturuuu.',
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
