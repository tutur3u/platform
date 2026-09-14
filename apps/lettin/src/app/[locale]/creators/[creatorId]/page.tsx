import { notFound } from 'next/navigation';
import { z } from 'zod';
import { Brand } from '@/components/brand';
import { PublicExplorer } from '@/components/public-explorer';
import { publicWorlds } from '@/lib/public-worlds';
export default async function Page({
  params,
}: {
  params: Promise<{ creatorId: string }>;
}) {
  const { creatorId } = await params;
  if (!z.guid().safeParse(creatorId).success) notFound();
  const worlds = (await publicWorlds()).filter(
    (world) => world.creatorId === creatorId
  );
  if (!worlds.length) notFound();
  return (
    <>
      <Brand />
      <PublicExplorer worlds={worlds} />
    </>
  );
}
