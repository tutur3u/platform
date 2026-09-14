'use client';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, Plus, Sprout } from '@tuturuuu/icons';
import { getLettinOverview } from '@tuturuuu/internal-api/lettin';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
import { Input } from '@tuturuuu/ui/input';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Link, useRouter } from '@/i18n/navigation';
import { AccessPanel } from './access-panel';
import { emptyDraft, useLettinMutation } from './use-lettin';
export function Studio({
  wsId,
  invitation,
}: {
  wsId: string;
  invitation?: string;
}) {
  const t = useTranslations('lettin');
  const router = useRouter();
  const [title, setTitle] = useState('');
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
  return (
    <main className="mx-auto max-w-6xl space-y-8 px-5 py-10 md:px-10">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="mb-3 text-muted-foreground text-xs uppercase tracking-[0.2em]">
            {t('privateStudio')}
          </p>
          <h1 className="text-4xl md:text-5xl">{t('myWorlds')}</h1>
          <p className="mt-3 text-muted-foreground">{t('studioDescription')}</p>
        </div>
        {data.canCreate && (
          <Dialog>
            <DialogTrigger asChild>
              <Button>
                <Plus />
                {t('newWorld')}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('newWorld')}</DialogTitle>
                <DialogDescription>{t('draftHint')}</DialogDescription>
              </DialogHeader>
              <form
                className="space-y-4"
                onSubmit={async (e) => {
                  e.preventDefault();
                  try {
                    const result = await mutation.mutateAsync({
                      action: 'createWorld',
                      draft: emptyDraft(title),
                    });
                    router.push(`/${wsId}/worlds/${result.id}`);
                  } catch {}
                }}
              >
                <label className="block space-y-2">
                  {t('title')}
                  <Input
                    required
                    maxLength={160}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </label>
                <Button disabled={mutation.isPending || !title.trim()}>
                  {t('create')}
                </Button>
                {mutation.errorMessage && (
                  <p role="alert">{mutation.errorMessage}</p>
                )}
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>
      {invitation && !data.approved && (
        <section className="notebook-paper space-y-3 rounded-xl p-6">
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
        <section className="notebook-paper rounded-xl p-10">
          <Sprout className="mb-5 size-9" />
          <h2 className="text-3xl">{t('inviteOnly')}</h2>
          <p className="mt-3 max-w-xl text-muted-foreground">
            {t('inviteOnlyHint')}
          </p>
        </section>
      ) : !data.canCreate ? (
        <p role="status">{t('permissionRequired')}</p>
      ) : data.worlds.length === 0 ? (
        <section className="notebook-paper rounded-xl px-8 py-16 text-center">
          <BookOpen className="mx-auto mb-5 size-10" />
          <h2 className="text-3xl">{t('emptyWorlds')}</h2>
          <p className="mt-3 text-muted-foreground">{t('emptyWorldsHint')}</p>
        </section>
      ) : (
        <div className="grid gap-7 sm:grid-cols-2 lg:grid-cols-3">
          {data.worlds.map((world) => (
            <Link
              key={world.id}
              href={`/${wsId}/worlds/${world.id}`}
              className="notebook-cover block overflow-hidden transition-transform hover:-translate-y-1 focus-visible:outline-2 focus-visible:outline-ring"
            >
              <div className="flex h-36 items-center justify-center bg-accent">
                {world.draft.image ? (
                  // biome-ignore lint/performance/noImgElement: Artwork must bypass optimizer caching so private media access can be revoked.
                  <img
                    src={world.draft.image}
                    alt=""
                    className="size-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <BookOpen className="size-12 text-primary" />
                )}
              </div>
              <div className="p-6">
                <p className="text-muted-foreground text-xs uppercase tracking-widest">
                  {t(world.published_at ? 'published' : 'draft')}
                </p>
                <h2 className="mt-3 break-words text-2xl">
                  {world.draft.title}
                </h2>
                <p className="mt-2 line-clamp-2 text-muted-foreground text-sm">
                  {world.draft.description || t('worldWaiting')}
                </p>
                <p className="mt-4 text-xs">{t(world.role)}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
      {mutation.errorMessage && <p role="alert">{mutation.errorMessage}</p>}
      {(data.canInvite || data.isAdmin) && (
        <AccessPanel wsId={wsId} data={data} />
      )}
    </main>
  );
}
