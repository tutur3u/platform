import { MeetTogetherPage } from '@tuturuuu/ui/legacy/meet/page';
import { createMarketingMetadata } from '@/lib/seo/marketing-metadata';

export const generateMetadata = createMarketingMetadata({
  title: 'Tuturuuu Meet Overview',
  description:
    'See what makes Tuturuuu Meet the intelligent meeting companion from Tuturuuu.',
  pathname: '/meet',
});

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
