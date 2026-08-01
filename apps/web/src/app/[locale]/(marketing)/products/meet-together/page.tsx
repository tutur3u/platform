import { permanentRedirect } from 'next/navigation';

export default async function LegacyMeetProductPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    for (const item of Array.isArray(value) ? value : value ? [value] : []) {
      query.append(key, item);
    }
  }
  permanentRedirect(`/meet${query.size ? `?${query}` : ''}`);
}
