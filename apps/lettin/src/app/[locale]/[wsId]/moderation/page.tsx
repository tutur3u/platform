import { connection } from 'next/server';
import { BlacklistManager } from '@/components/blacklist-manager';
export default async function Page({
  params,
}: {
  params: Promise<{ wsId: string }>;
}) {
  await connection();
  return <BlacklistManager wsId={(await params).wsId} />;
}
