import { permanentRedirect } from 'next/navigation';

export default async function LegacyMeetPlanPage({
  params,
  searchParams,
}: {
  params: Promise<{ planId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { planId } = await params;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    for (const item of Array.isArray(value) ? value : value ? [value] : []) {
      query.append(key, item);
    }
  }
  permanentRedirect(`/meet/plans/${planId}${query.size ? `?${query}` : ''}`);
}
