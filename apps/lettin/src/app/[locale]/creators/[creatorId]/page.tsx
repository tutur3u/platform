import { notFound } from 'next/navigation';
import { z } from 'zod';
import { Brand } from '@/components/brand';
import { PublicExplorer } from '@/components/public-explorer';
import { publicWorlds } from '@/lib/public-worlds';
export default async function Page({
  params,
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string }>;
  params: Promise<{ creatorId: string }>;
}) {
  const { creatorId } = await params;
  if (!z.guid().safeParse(creatorId).success) notFound();
  const query = await searchParams;
  const page = Math.min(
    10000,
    Math.max(1, Math.floor(Number(query.page)) || 1)
  );
  const worlds = await publicWorlds(undefined, {
    creatorId,
    page,
    search: query.q?.slice(0, 200),
  });
  if (!worlds.length) notFound();
  return (
    <div className="notebook-theme min-h-screen">
      <Brand />
      <PublicExplorer worlds={worlds} page={page} search={query.q} />
    </div>
  );
}
