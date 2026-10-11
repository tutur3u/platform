'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getLettinCreatorSaved,
  setLettinCreatorSaved,
} from '@tuturuuu/internal-api/lettin';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import { useRef } from 'react';
export function CreatorBookmark({
  creatorId,
  actorId,
}: {
  creatorId: string;
  actorId: string;
}) {
  const t = useTranslations('lettin');
  const client = useQueryClient();
  const fence = useRef(false);
  const key = ['lettin-creator-reader', actorId, 'saved', creatorId];
  const query = useQuery({
    queryKey: key,
    queryFn: () => getLettinCreatorSaved(creatorId, actorId),
    retry: false,
  });
  const mutation = useMutation({
    mutationFn: (saved: boolean) =>
      setLettinCreatorSaved(creatorId, saved, actorId),
    retry: false,
    onSuccess: async (result) => {
      client.setQueryData(key, result);
      await client.invalidateQueries({
        queryKey: ['lettin-creator-reader', actorId, 'library'],
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
        {t(query.data?.saved ? 'removeSavedCreator' : 'saveCreator')}
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
