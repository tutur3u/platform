'use client';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Plus } from '@tuturuuu/icons';
import { getLettinWorld } from '@tuturuuu/internal-api/lettin';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Link } from '@/i18n/navigation';
import { Collaborators } from './collaborators';
import { EntryEditor } from './entry-editor';
import { useNavigationGuard } from './navigation-guard';
import { emptyDraft, useLettinMutation } from './use-lettin';
export function WorldStudio({
  wsId,
  worldId,
}: {
  wsId: string;
  worldId: string;
}) {
  const t = useTranslations('lettin');
  const [selected, setSelected] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [search, setSearch] = useState('');
  const { dirty, setDirty } = useNavigationGuard();
  useEffect(() => () => setDirty(false), [setDirty]);
  const query = useQuery({
    queryKey: ['lettin', wsId, worldId],
    queryFn: () => getLettinWorld(wsId, worldId),
  });
  const mutation = useLettinMutation(wsId);
  if (query.isPending)
    return (
      <p role="status" className="p-10">
        {t('loading')}
      </p>
    );
  if (query.isError && !query.data)
    return (
      <div role="alert" className="p-10">
        {t('requestFailed')}{' '}
        <Button onClick={() => query.refetch()}>{t('retry')}</Button>
      </div>
    );
  const data = query.data;
  if (!data) return null;
  const record = data.entries.find((e) => e.id === selected) ?? data.world;
  return (
    <main className="mx-auto max-w-7xl px-5 py-8 md:px-10">
      {query.isError && (
        <p role="alert">
          {t('requestFailed')}{' '}
          <Button onClick={() => query.refetch()}>{t('retry')}</Button>
        </p>
      )}
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <Link
          href={`/${wsId}`}
          className="flex items-center gap-2 text-sm"
          onClick={(e) => {
            if (dirty) e.preventDefault();
          }}
        >
          <ArrowLeft className="size-4" />
          {t('myWorlds')}
        </Link>
        <h1 className="max-w-xl break-words text-3xl">
          {data.world.draft.title}
        </h1>
        {data.world.published_at && (
          <Link
            className="text-sm underline"
            href={`/worlds/${worldId}`}
            target="_blank"
          >
            {t('viewPublic')}
          </Link>
        )}
      </div>
      <div className="grid items-start gap-8 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="lettin-sidebar space-y-4 lg:sticky lg:top-5">
          <Button
            variant={selected === null ? 'secondary' : 'ghost'}
            className="w-full justify-start"
            disabled={dirty}
            onClick={() => setSelected(null)}
          >
            {t('worldDetails')}
          </Button>
          <label className="block text-sm">
            {t('searchEntries')}
            <Input value={search} onChange={(e) => setSearch(e.target.value)} />
          </label>
          <nav
            aria-label={t('entries')}
            className="max-h-64 space-y-1 overflow-y-auto lg:max-h-[40vh]"
          >
            {data.entries
              .filter((e) =>
                `${e.draft.title} ${e.draft.kind} ${e.draft.tags.join(' ')}`
                  .toLowerCase()
                  .includes(search.toLowerCase())
              )
              .map((e) => (
                <Button
                  key={e.id}
                  disabled={dirty}
                  variant={e.id === selected ? 'secondary' : 'ghost'}
                  className="h-auto w-full justify-start whitespace-normal break-words text-left"
                  onClick={() => setSelected(e.id)}
                >
                  {e.draft.title}
                  <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                    {t(e.published_at ? 'published' : 'draft')}
                  </span>
                </Button>
              ))}
          </nav>
          <form
            className="space-y-2 border-border border-t pt-4"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                const result = await mutation.mutateAsync({
                  action: 'createEntry',
                  worldId,
                  draft: emptyDraft(title),
                });
                setSelected(result.id);
                setTitle('');
              } catch {
                /* Render mutation error below. */
              }
            }}
          >
            <Input
              aria-label={t('newEntry')}
              placeholder={t('newEntry')}
              required
              maxLength={160}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <Button
              disabled={dirty || mutation.isPending || !title.trim()}
              variant="outline"
              className="w-full"
            >
              <Plus />
              {t('addEntry')}
            </Button>
          </form>
          {dirty && (
            <p role="status" className="text-muted-foreground text-xs">
              {t('saveBeforeSwitch')}
            </p>
          )}
          {mutation.errorMessage && <p role="alert">{mutation.errorMessage}</p>}
        </aside>
        <div className="min-w-0 space-y-8">
          <EntryEditor
            key={record.id}
            record={record}
            wsId={wsId}
            worldId={worldId}
            worldRole={data.role}
            isWorld={record.id === worldId}
            entries={data.entries}
            onDirty={setDirty}
          />
          {data.role === 'owner' && <Collaborators wsId={wsId} data={data} />}
        </div>
      </div>
    </main>
  );
}
