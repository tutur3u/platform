import { connection } from 'next/server';
import { CreatorProfileEditor } from '@/components/creator-profile-editor';
import { publicWorlds } from '@/lib/public-worlds';
import { bindings } from '@/server/bindings';
import { isCreator } from '@/server/context';
import { resolveActor } from '@/server/identity';
export default async function Page({
  params,
}: {
  params: Promise<{ wsId: string }>;
}) {
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
