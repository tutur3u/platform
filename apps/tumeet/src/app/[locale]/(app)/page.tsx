import { DEV_MODE } from '@/constants/common';
import { MeetTogetherPage } from '@tuturuuu/ui/legacy/tumeet/page';
import { redirect } from 'next/navigation';

interface TumeetPageProps {
  searchParams: Promise<{
    page?: string;
    pageSize?: string;
    search?: string;
  }>;
}

export default async function TumeetPage({ searchParams }: TumeetPageProps) {
  if (!DEV_MODE) {
    // Tumeet is not production-ready yet, so we redirect to the platform app
    redirect('https://tuturuuu.com/meet-together/plans');
  }

  return <MeetTogetherPage searchParams={searchParams} />;
}
