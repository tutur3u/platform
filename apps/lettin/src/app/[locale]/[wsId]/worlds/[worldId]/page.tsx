import { connection } from 'next/server';
import { WorldStudio } from '@/components/world-studio';
export default async function Page({
  params,
}: {
  params: Promise<{ wsId: string; worldId: string }>;
}) {
  await connection();
  return <WorldStudio {...(await params)} />;
}
