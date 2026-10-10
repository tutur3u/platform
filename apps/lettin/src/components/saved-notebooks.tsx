'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getLettinSavedNotebooks,
  setLettinNotebookSaved,
} from '@tuturuuu/internal-api/lettin';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import { useRef } from 'react';
import { Link } from '@/i18n/navigation';
import {
  matchesSavedLibrary,
  SavedLibraryFilterControls,
  useSavedLibraryFilters,
} from './saved-library-filters';
export function SavedNotebooks({ actorId }: { actorId: string }) {
  return <SavedNotebooksList key={actorId} actorId={actorId} />;
}
function SavedNotebooksList({ actorId }: { actorId: string }) {
  const [filters, setFilters] = useSavedLibraryFilters();
  const t = useTranslations('lettin'),
    client = useQueryClient();
  const fence = useRef(false);
  const key = ['lettin-reader', actorId, 'library'];
  const query = useQuery({
    queryKey: key,
    queryFn: () => getLettinSavedNotebooks(actorId),
    retry: false,
  });
  const mutation = useMutation({
    mutationFn: (id: string) => setLettinNotebookSaved(id, false, actorId),
    retry: false,
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['lettin-reader', actorId] });
    },
  });
  const visible = query.data?.filter((item) =>
    matchesSavedLibrary(filters, item.notebook?.title ?? null, !!item.notebook)
  );
  return (
    <main className="mx-auto max-w-5xl space-y-6 px-5 py-10">
      <h1 className="text-4xl">{t('savedNotebooks')}</h1>
      <p>{t('savedNotebooksHint')}</p>
      {query.isPending && <p role="status">{t('loading')}</p>}
      {query.isError && (
        <div role="alert">
          {t('requestFailed')}{' '}
          <Button onClick={() => query.refetch()}>{t('retry')}</Button>
        </div>
      )}
      {query.data?.length === 0 && <p>{t('noSavedNotebooks')}</p>}
      {query.data && query.data.length > 0 && (
        <SavedLibraryFilterControls filters={filters} onChange={setFilters} />
      )}
      {query.data && query.data.length > 0 && visible?.length === 0 && (
        <p role="status">{t('savedLibraryNoMatches')}</p>
      )}
      <ul className="space-y-4">
        {visible?.map((item) => (
          <li
            key={item.worldId}
            className="space-y-3 rounded-lg border border-border p-4"
          >
            {item.notebook ? (
              <>
                <Link
                  href={`/worlds/${item.worldId}`}
                  className="break-words font-semibold text-xl"
                >
                  {item.notebook.title}
                </Link>
                <p className="break-words">{item.notebook.description}</p>
                {item.notebook.credit && (
                  <p className="text-muted-foreground text-sm">
                    {item.notebook.credit}
                  </p>
                )}
              </>
            ) : (
              <p>{t('savedNotebookUnavailable')}</p>
            )}
            <Button
              variant="ghost"
              disabled={mutation.isPending}
              onClick={async () => {
                if (fence.current) return;
                fence.current = true;
                try {
                  await mutation.mutateAsync(item.worldId);
                } catch {
                  /* Keep the item until removal is confirmed. */
                } finally {
                  fence.current = false;
                }
              }}
            >
              {t('removeSavedNotebook')}
            </Button>
          </li>
        ))}
      </ul>
      {mutation.isError && <p role="alert">{t('requestFailed')}</p>}
      <Link href="/worlds">{t('explore')}</Link>
    </main>
  );
}
