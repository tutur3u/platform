import { MeetTogetherPage } from '@tuturuuu/ui/legacy/meet/page';
import { createMarketingMetadata } from '@/lib/seo/marketing-metadata';

export const generateMetadata = createMarketingMetadata({
  title: 'Meet Together Overview',
  description:
    'See how Tuturuuu Meet Together streamlines collaborative meetings.',
  pathname: '/meet-together',
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
