import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { z } from 'zod';
import { isWikiSection } from '@/components/wiki-model';
import { WorldStudio } from '@/components/world-studio';
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ wsId: string; worldId: string; section: string }>;
  searchParams: Promise<{ entry?: string }>;
}) {
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
