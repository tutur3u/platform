import { MeetTogetherPage } from '@tuturuuu/ui/legacy/meet/page';
import { connection } from 'next/server';
import { Suspense } from 'react';

interface TumeetPageProps {
  searchParams: Promise<{
    page?: string;
    pageSize?: string;
    search?: string;
  }>;
}

export default function TumeetPage({ searchParams }: TumeetPageProps) {
  return (
    <Suspense>
      <RequestTimeMeetPage searchParams={searchParams} />
    </Suspense>
  );
}

async function RequestTimeMeetPage({ searchParams }: TumeetPageProps) {
  await connection();

  return <MeetTogetherPage searchParams={searchParams} path="/plans" />;
}
