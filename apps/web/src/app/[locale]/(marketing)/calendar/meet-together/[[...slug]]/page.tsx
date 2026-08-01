import { NO_INDEX_ROBOTS } from '@tuturuuu/utils/common/metadata';
import type { Metadata } from 'next';
import { permanentRedirect } from 'next/navigation';

export const metadata: Metadata = {
  title: 'Tuturuuu Meet',
  description: 'Legacy Tuturuuu Meet route.',
  robots: NO_INDEX_ROBOTS,
};

export default async function LegacyMeetCalendarPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug?: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    for (const item of Array.isArray(value) ? value : value ? [value] : []) {
      query.append(key, item);
    }
  }
  permanentRedirect(
    `/meet${slug?.length ? `/${slug.join('/')}` : ''}${query.size ? `?${query}` : ''}`
  );
}
