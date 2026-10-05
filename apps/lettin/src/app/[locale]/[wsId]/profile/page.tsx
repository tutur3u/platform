import { connection } from 'next/server';
import { Suspense } from 'react';
import { CreatorProfileEditor } from '@/components/creator-profile-editor';
import { publicWorlds } from '@/lib/public-worlds';
import { bindings } from '@/server/bindings';
import { isCreator } from '@/server/context';
import { resolveActor } from '@/server/identity';
import Loading from '../wiki/loading';

type PageProps = {
  params: Promise<{ wsId: string }>;
};

export default function Page(props: PageProps) {
  return (
    <Suspense fallback={<Loading />}>
      <ProfilePage {...props} />
    </Suspense>
  );
}

async function ProfilePage({ params }: PageProps) {
  await connection();
  const { wsId } = await params;
  const actor = await resolveActor(wsId);
  const canEditAbout =
    actor.canManage && (await isCreator((await bindings()).db, actor));
  const hasPublishedWorlds =
    !!actor &&
    (await publicWorlds(undefined, { creatorId: actor.id })).length > 0;
  return (
    <CreatorProfileEditor
      wsId={wsId}
      canEditAbout={canEditAbout}
      hasPublishedWorlds={hasPublishedWorlds}
    />
  );
}
