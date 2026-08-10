import { MeetTogetherPage } from '@tuturuuu/ui/legacy/meet/page';
import { Suspense } from 'react';

interface TumeetPageProps {
  searchParams: Promise<{
    page?: string;
    pageSize?: string;
    search?: string;
  }>;
}

export default async function TumeetPage({ searchParams }: TumeetPageProps) {
  return (
    <Suspense>
      <MeetTogetherPage searchParams={searchParams} path="/plans" />
    </Suspense>
  );
}
