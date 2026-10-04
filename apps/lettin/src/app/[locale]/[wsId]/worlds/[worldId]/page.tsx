import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { z } from 'zod';
import { WorldStudio } from '@/components/world-studio';
export default async function Page({
  params,
  searchParams,
}: {
  searchParams: Promise<{ entry?: string }>;
  params: Promise<{ wsId: string; worldId: string }>;
}) {
  await connection();
  const route = await params;
  if (!z.guid().safeParse(route.worldId).success) notFound();
  return <WorldStudio {...route} initialEntry={(await searchParams).entry} />;
}
