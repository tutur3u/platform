import { MeetTogetherPage } from '@tuturuuu/ui/legacy/meet/page';
import type { Metadata } from 'next';
import { connection } from 'next/server';
import { Suspense } from 'react';

export const metadata: Metadata = {
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
};

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
