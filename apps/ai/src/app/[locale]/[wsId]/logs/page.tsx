import { permanentRedirect } from 'next/navigation';

/**
 * `logs` used to render the same activity explorer as `runs`. It now redirects
 * so existing links and bookmarks keep working after the sections merged.
 */
export default async function LogsPage({
  params,
}: {
  params: Promise<{ wsId: string }>;
}) {
  const { wsId } = await params;
  permanentRedirect(`/${wsId}/runs`);
}
