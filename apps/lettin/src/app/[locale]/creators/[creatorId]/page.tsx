import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { Brand } from '@/components/brand';
import { CreatorAboutView } from '@/components/creator-about-view';
import { CreatorProfileHeader } from '@/components/creator-profile-header';
import { PublicExplorer } from '@/components/public-explorer';
import { publicWorlds } from '@/lib/public-worlds';
import { bindings } from '@/server/bindings';
import { readCreatorAbout } from '@/server/creator-about';
import { readCreatorIdentity } from '@/server/creator-profile';
export default async function Page({
  params,
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string }>;
  params: Promise<{ creatorId: string }>;
}) {
  const { creatorId } = await params;
  await connection();
  const identity = await readCreatorIdentity(creatorId);
  if (!identity) notFound();
  const query = await searchParams;
  const page = Math.min(
    10000,
    Math.max(1, Math.floor(Number(query.page)) || 1)
  );
  const worlds = await publicWorlds(undefined, {
    creatorId: identity.id,
    page,
    search: query.q?.slice(0, 200),
  });
  if (!worlds.length) notFound();
  const about = await readCreatorAbout((await bindings()).db, identity.id);
  return (
    <div
      className="notebook-theme wiki-theme min-h-screen"
      data-wiki-theme={about.theme.palette}
      data-wiki-type={about.theme.typography}
      data-wiki-motion={about.theme.motion}
    >
      <Brand />
      <div className="creator-profile-editor">
        <CreatorProfileHeader profile={identity} />
        <CreatorAboutView details={about} />
      </div>
      <PublicExplorer worlds={worlds} page={page} search={query.q} />
    </div>
  );
}
