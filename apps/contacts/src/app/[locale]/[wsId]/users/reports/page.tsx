import { redirect } from 'next/navigation';
import { connection } from 'next/server';

interface Props {
  params: Promise<{ wsId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function LegacyPeriodicReportsPage(props: Props) {
  return LegacyPeriodicReportsRedirect(props);
}

async function LegacyPeriodicReportsRedirect({ params, searchParams }: Props) {
  await connection();
  const { wsId } = await params;
  const query = new URLSearchParams();
  const raw = await searchParams;
  for (const [key, value] of Object.entries(raw)) {
    for (const item of Array.isArray(value) ? value : [value]) {
      if (item !== undefined) query.append(key, item);
    }
  }
  query.set('view', 'periodic');
  return redirect(`/${wsId}/reports?${query.toString()}`);
}
