import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { z } from 'zod';
import { isWikiSection } from '@/components/wiki-model';
import { WorldStudio } from '@/components/world-studio';
import Loading from '../../loading';

type PageProps = {
  params: Promise<{ wsId: string; worldId: string; section: string }>;
  searchParams: Promise<{ entry?: string }>;
};

export default function Page(props: PageProps) {
  return (
    <Suspense fallback={<Loading />}>
      <WikiSectionPage {...props} />
    </Suspense>
  );
}

async function WikiSectionPage({ params, searchParams }: PageProps) {
  await connection();
  const { wsId, worldId, section } = await params;
  if (!z.guid().safeParse(worldId).success || !isWikiSection(section))
    notFound();
  return (
    <WorldStudio
      key={`${worldId}-${section}`}
      wsId={wsId}
      worldId={worldId}
      section={section}
      initialEntry={(await searchParams).entry}
    />
  );
}
