import { connection } from 'next/server';
import { Studio } from '@/components/studio';
export default async function Page({
  params,
}: {
  params: Promise<{ wsId: string }>;
}) {
  await connection();
  return <Studio wsId={(await params).wsId} />;
}
