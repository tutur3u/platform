import { notFound } from 'next/navigation';
import { z } from 'zod';
import { Brand } from '@/components/brand';
import { PublicWorld } from '@/components/public-world';
import { publicWorlds } from '@/lib/public-worlds';
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
    <>
      <Brand />
      <PublicWorld world={world} initialEntry={(await searchParams).entry} />
    </>
  );
}
