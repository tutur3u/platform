import { connection } from 'next/server';
import { Studio } from '@/components/studio';
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ wsId: string }>;
  searchParams: Promise<{ invitation?: string }>;
}) {
  await connection();
  return (
    <Studio
      wsId={(await params).wsId}
      invitation={(await searchParams).invitation}
    />
  );
}
