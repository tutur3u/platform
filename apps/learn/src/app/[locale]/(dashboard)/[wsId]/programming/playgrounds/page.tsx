import { listHostedPlaygrounds } from '@tuturuuu/internal-api/playgrounds';
import { connection } from 'next/server';
import { programmingApiOptions } from '@/lib/programming/server';
import { PlaygroundCatalog } from './playground-catalog';
export default async function PlaygroundsPage({
  params,
}: {
  params: Promise<{ wsId: string }>;
}) {
  await connection();
  const { wsId } = await params;
  const initial = await listHostedPlaygrounds(await programmingApiOptions());
  return <PlaygroundCatalog wsId={wsId} initial={initial} />;
}
