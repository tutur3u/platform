import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { Brand } from '@/components/brand';
import { CreatorAboutView } from '@/components/creator-about-view';
import { CreatorProfileHeader } from '@/components/creator-profile-header';
import { PublicExplorer } from '@/components/public-explorer';
import { ReaderCreatorBookmark } from '@/components/reader-creator-bookmark';
import { createLettinPageMetadata } from '@/lib/page-metadata';
import { publicWorlds } from '@/lib/public-worlds';
import { bindings } from '@/server/bindings';
import { readCreatorAbout } from '@/server/creator-about';
import { readCreatorIdentity } from '@/server/creator-profile';
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; creatorId: string }>;
}) {
  const { locale, creatorId } = await params;
  await connection();
  const identity = await readCreatorIdentity(creatorId);
  if (
    !identity ||
    !(await publicWorlds(undefined, { creatorId: identity.id, page: 1 })).length
  ) {
    notFound();
  }
  return createLettinPageMetadata({
    title: identity.display_name || identity.handle || 'Tulletin',
    description: identity.bio || '',
    image: identity.banner_url || identity.avatar_url || undefined,
    locale,
    pathname: `/creators/${identity.id}`,
  });
}

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
      <Suspense>
        <ReaderCreatorBookmark creatorId={identity.id} />
      </Suspense>
      <PublicExplorer worlds={worlds} page={page} search={query.q} />
    </div>
  );
}
