import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { z } from 'zod';
import { Brand } from '@/components/brand';
import { PublicWorld } from '@/components/public-world';
import { ReaderBookmark } from '@/components/reader-bookmark';
import { createLettinPageMetadata } from '@/lib/page-metadata';
import { publicWorlds } from '@/lib/public-worlds';
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; worldId: string }>;
}) {
  const { locale, worldId } = await params;
  if (!z.guid().safeParse(worldId).success) notFound();
  const world = (await publicWorlds(worldId))[0];
  if (!world) notFound();
  return createLettinPageMetadata({
    title: world.published.title,
    description: world.published.description,
    image: world.published.image || undefined,
    locale,
    pathname: `/worlds/${worldId}`,
  });
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ worldId: string }>;
  searchParams: Promise<{ entry?: string }>;
}) {
  const { worldId } = await params;
  if (!z.guid().safeParse(worldId).success) notFound();
  const world = (await publicWorlds(worldId))[0];
  if (!world) notFound();
  return (
    <div className="notebook-theme min-h-screen">
      <Brand />
      <Suspense>
        <ReaderBookmark worldId={worldId} />
      </Suspense>
      <PublicWorld world={world} initialEntry={(await searchParams).entry} />
    </div>
  );
}
