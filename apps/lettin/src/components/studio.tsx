'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ArrowUpRight, BookOpen, Sprout } from '@tuturuuu/icons';
import { getLettinOverview } from '@tuturuuu/internal-api/lettin';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { AccessPanel } from './access-panel';
import { CreateWorld } from './create-world';
import { CreativeSpaces } from './creative-spaces';
import { SpaceArtwork } from './space-artwork';
import { belongsToSpace, type CreativeSpace } from './spaces';
import { useLettinMutation } from './use-lettin';
import { WorldShelf } from './world-shelf';

export function Studio({
  wsId,
  invitation,
  space,
}: {
  wsId: string;
  invitation?: string;
  space?: CreativeSpace;
}) {
  const t = useTranslations('lettin');
  const query = useQuery({
    queryKey: ['lettin', wsId],
    queryFn: () => getLettinOverview(wsId),
  });
  const mutation = useLettinMutation(wsId);
  if (query.isPending)
    return (
      <p className="p-10" role="status">
        {t('loading')}
      </p>
    );
  if (query.isError)
    return (
      <div className="p-10" role="alert">
        {t('requestFailed')}{' '}
        <Button onClick={() => query.refetch()}>{t('retry')}</Button>
      </div>
    );
  const data = query.data;
  const shelf = space
    ? data.worlds.filter((world) => belongsToSpace(world.draft, space))
    : data.worlds;
  return (
    <main className="mx-auto max-w-[90rem] space-y-10 px-5 py-10 md:px-10">
      {space && (
        <Link
          href={`/${wsId}`}
          className="inline-flex items-center gap-2 text-sm"
        >
          <ArrowLeft size={16} />
          {t('myWorlds')}
        </Link>
      )}
      <div
        className={`${space ? `space-header space-header-${space}` : ''} lettin-section-heading flex flex-wrap items-end justify-between gap-5`}
      >
        {space && <SpaceArtwork space={space} />}
        <div>
          <h1>{t(space ? `space${space}Title` : 'myWorlds')}</h1>
          <p className="lettin-summary mt-4 max-w-xl text-lg">
            {t(space ? `space${space}Hint` : 'studioDescription')}
          </p>
        </div>
        {data.canCreate && <CreateWorld wsId={wsId} initialStarter={space} />}
      </div>
      {invitation && !data.approved && (
        <section className="notebook-paper space-y-3 p-6">
          <h2 className="text-2xl">{t('invitation')}</h2>
          <p>{t('acceptHint')}</p>
          <Button
            disabled={mutation.isPending}
            onClick={() =>
              mutation.mutate({
                action: 'acceptInvitation',
                invitationId: invitation,
              })
            }
          >
            {t('accept')}
          </Button>
        </section>
      )}
      {!data.approved ? (
        <section className="notebook-paper p-10">
          <Sprout className="mb-5 size-9" />
          <h2 className="text-3xl">{t('inviteOnly')}</h2>
          <p className="mt-3 max-w-xl text-muted-foreground">
            {t('inviteOnlyHint')}
          </p>
          <Link className="lettin-secondary-link mt-6" href="/worlds">
            {t('exploreWorlds')}
            <ArrowUpRight size={16} />
          </Link>
        </section>
      ) : !data.canCreate ? (
        <p role="status">{t('permissionRequired')}</p>
      ) : shelf.length === 0 ? (
        <section className="notebook-paper px-8 py-16 text-center">
          <BookOpen className="mx-auto mb-5 size-10" />
          <h2 className="text-3xl">
            {t(space ? 'emptySpace' : 'emptyWorlds')}
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-muted-foreground">
            {t(space ? 'emptySpaceHint' : 'emptyWorldsHint')}
          </p>
        </section>
      ) : (
        <WorldShelf key={space ?? 'all'} wsId={wsId} shelf={shelf} />
      )}
      {!space && <CreativeSpaces wsId={wsId} />}
      {mutation.errorMessage && <p role="alert">{mutation.errorMessage}</p>}
      {(data.canInvite || data.isAdmin || data.invitations.length > 0) && (
        <AccessPanel wsId={wsId} data={data} />
      )}
    </main>
  );
}
