import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { isCreativeSpace } from '@/components/spaces';
import { Studio } from '@/components/studio';

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ wsId: string; space: string }>;
  searchParams: Promise<{ invitation?: string }>;
}) {
  await connection();
  const { wsId, space } = await params;
  if (!isCreativeSpace(space)) notFound();
  return (
    <Studio
      wsId={wsId}
      space={space}
      invitation={(await searchParams).invitation}
    />
  );
}
