'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getLettinSavedCreators,
  setLettinCreatorSaved,
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
import { orderSavedLibrary } from './saved-library-ordering';
export function SavedCreators({ actorId }: { actorId: string }) {
  return <SavedCreatorsList key={actorId} actorId={actorId} />;
}
function SavedCreatorsList({ actorId }: { actorId: string }) {
  const [filters, setFilters] = useSavedLibraryFilters();
  const t = useTranslations('lettin'),
    client = useQueryClient();
  const fence = useRef(false);
  const key = ['lettin-creator-reader', actorId, 'library'];
  const query = useQuery({
    queryKey: key,
    queryFn: () => getLettinSavedCreators(actorId),
    retry: false,
  });
  const mutation = useMutation({
    mutationFn: (id: string) => setLettinCreatorSaved(id, false, actorId),
    retry: false,
    onSuccess: async () => {
      await client.invalidateQueries({
        queryKey: ['lettin-creator-reader', actorId],
      });
    },
  });
  const visible =
    query.data &&
    orderSavedLibrary(
      query.data.filter((item) =>
        matchesSavedLibrary(filters, item.notebookTitle, !!item.notebookTitle)
      ),
      filters.order,
      (item) => item.notebookTitle
    );
  return (
    <section className="mx-auto max-w-5xl space-y-6 px-5 py-10">
      <h2 className="text-4xl">{t('savedCreators')}</h2>
      <p>{t('savedCreatorsHint')}</p>
      {query.isPending && <p role="status">{t('loading')}</p>}
      {query.isError && (
        <div role="alert">
          {t('requestFailed')}{' '}
          <Button onClick={() => query.refetch()}>{t('retry')}</Button>
        </div>
      )}
      {query.data?.length === 0 && <p>{t('noSavedCreators')}</p>}
      {query.data && query.data.length > 0 && (
        <SavedLibraryFilterControls filters={filters} onChange={setFilters} />
      )}
      {query.data && query.data.length > 0 && visible?.length === 0 && (
        <p role="status">{t('savedLibraryNoMatches')}</p>
      )}
      <ul className="space-y-4">
        {visible?.map((item) => (
          <li
            key={item.creatorId}
            className="space-y-3 rounded-lg border border-border p-4"
          >
            {item.notebookTitle ? (
              <Link
                href={`/creators/${item.creatorId}`}
                className="break-words font-semibold text-xl"
              >
                {t('savedCreatorNotebook', { title: item.notebookTitle })}
              </Link>
            ) : (
              <p>{t('savedCreatorUnavailable')}</p>
            )}
            <Button
              variant="ghost"
              disabled={mutation.isPending}
              onClick={async () => {
                if (fence.current) return;
                fence.current = true;
                try {
                  await mutation.mutateAsync(item.creatorId);
                } catch {
                  /* Keep the item until removal is confirmed. */
                } finally {
                  fence.current = false;
                }
              }}
            >
              {t('removeSavedCreator')}
            </Button>
          </li>
        ))}
      </ul>
      {mutation.isError && <p role="alert">{t('requestFailed')}</p>}
      <Link href="/worlds">{t('explore')}</Link>
    </section>
  );
}
