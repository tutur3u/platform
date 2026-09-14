'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { InternalApiError } from '@tuturuuu/internal-api';
import {
  type LettinCommand,
  type LettinDraft,
  mutateLettin,
} from '@tuturuuu/internal-api/lettin';
import { useTranslations } from 'next-intl';
export const emptyDraft = (title: string): LettinDraft => ({
  title,
  description: '',
  image: '',
  credit: '',
  kind: 'page',
  tags: [],
  links: [],
  content: { type: 'doc', content: [{ type: 'paragraph' }] },
});
export function useLettinMutation(wsId: string) {
  const client = useQueryClient();
  const t = useTranslations('lettin');
  const mutation = useMutation({
    mutationFn: (command: LettinCommand) => mutateLettin(wsId, command),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['lettin', wsId] });
    },
  });
  const error = mutation.error
    ? mutation.error instanceof InternalApiError &&
      mutation.error.status === 409
      ? t('conflict')
      : t('requestFailed')
    : null;
  return { ...mutation, errorMessage: error };
}
