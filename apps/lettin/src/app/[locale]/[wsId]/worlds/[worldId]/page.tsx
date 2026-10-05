import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { z } from 'zod';
import { WorldStudio } from '@/components/world-studio';
import Loading from '../loading';

type PageProps = {
  searchParams: Promise<{ entry?: string }>;
  params: Promise<{ wsId: string; worldId: string }>;
};

export default function Page(props: PageProps) {
  return (
    <Suspense fallback={<Loading />}>
      <WorldPage {...props} />
    </Suspense>
  );
}

async function WorldPage({ params, searchParams }: PageProps) {
  await connection();
  const route = await params;
  if (!z.guid().safeParse(route.worldId).success) notFound();
  return <WorldStudio {...route} initialEntry={(await searchParams).entry} />;
}
