'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getLettinNotebookSaved,
  setLettinNotebookSaved,
} from '@tuturuuu/internal-api/lettin';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import { useRef } from 'react';
export function NotebookBookmark({
  worldId,
  actorId,
}: {
  worldId: string;
  actorId: string;
}) {
  const t = useTranslations('lettin');
  const client = useQueryClient();
  const fence = useRef(false);
  const key = ['lettin-reader', actorId, 'saved', worldId];
  const query = useQuery({
    queryKey: key,
    queryFn: () => getLettinNotebookSaved(worldId, actorId),
    retry: false,
  });
  const mutation = useMutation({
    mutationFn: (saved: boolean) =>
      setLettinNotebookSaved(worldId, saved, actorId),
    retry: false,
    onSuccess: async (result) => {
      client.setQueryData(key, result);
      await client.invalidateQueries({
        queryKey: ['lettin-reader', actorId, 'library'],
      });
    },
  });
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        variant="outline"
        disabled={query.isPending || query.isError || mutation.isPending}
        aria-pressed={query.data?.saved ?? false}
        onClick={async () => {
          if (fence.current || !query.data) return;
          fence.current = true;
          try {
            await mutation.mutateAsync(!query.data.saved);
          } catch {
            /* Keep the saved state unchanged. */
          } finally {
            fence.current = false;
          }
        }}
      >
        {t(query.data?.saved ? 'removeSavedNotebook' : 'saveNotebook')}
      </Button>
      {query.isError && (
        <Button variant="ghost" onClick={() => query.refetch()}>
          {t('retry')}
        </Button>
      )}
      {(query.isError || mutation.isError) && (
        <p role="alert">{t('requestFailed')}</p>
      )}
    </div>
  );
}
