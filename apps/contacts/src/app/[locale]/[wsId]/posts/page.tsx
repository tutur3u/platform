import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { Suspense } from 'react';
import type { RawPostsSearchParams } from './types';

interface Props {
  params: Promise<{ wsId: string }>;
  searchParams: Promise<RawPostsSearchParams>;
}

export default function LegacyPostsPage(props: Props) {
  return (
    <Suspense fallback={null}>
      <LegacyPostsRedirect {...props} />
    </Suspense>
  );
}

export async function LegacyPostsRedirect({ params, searchParams }: Props) {
  await connection();
  const { wsId } = await params;
  const query = new URLSearchParams();
  const raw = await searchParams;
  for (const [key, value] of Object.entries(raw)) {
    for (const item of Array.isArray(value) ? value : [value]) {
      if (item !== undefined) query.append(key, item);
    }
  }
  query.set('view', 'daily');
  return redirect(`/${wsId}/reports?${query.toString()}`);
}
