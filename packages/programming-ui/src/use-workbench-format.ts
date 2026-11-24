'use client';
import { useMutation } from '@tanstack/react-query';
import { replaceProgrammingText } from '@tuturuuu/realtime';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import type * as Y from 'yjs';
import { type FormatSupport, formatSupport } from './format/formatters';

class FileChangedError extends Error {}

/** A module that would not load: the person is offline or the chunk is gone. */
const isLoadFailure = (error: unknown) =>
  error instanceof TypeError ||
  (error instanceof Error &&
    /dynamically imported module|Loading chunk|ChunkLoadError|wasm/i.test(
      `${error.name} ${error.message}`
    ));

/**
 * Formats the open file for the whole room as one edit: the formatter runs
 * on the shared text, and its result is written back in a single Yjs
 * transaction, so there is one update to send and one step to undo. If
 * someone else edits the file while the formatter runs, nothing is written,
 * because the result would overwrite their change.
 */
export function useWorkbenchFormat({
  doc,
  path,
  editable,
}: {
  doc: Y.Doc | undefined;
  path: string | undefined;
  editable: boolean;
}) {
  const t = useTranslations('programmingPlayground');
  const support: FormatSupport = formatSupport(path);
  const mutation = useMutation({
    mutationFn: async () => {
      if (!doc || !path || !editable || !support.supported) return 'skipped';
      const text = doc.getMap<Y.Text>('files').get(path);
      if (!text) return 'skipped';
      const before = text.toString();
      const after = await support.formatter.format(before, path);
      if (text.toString() !== before) throw new FileChangedError();
      if (after === before) return 'unchanged';
      replaceProgrammingText(text, after, 'format');
      return 'formatted';
    },
    onSuccess: (result) => {
      if (result === 'unchanged') toast(t('formatAlready'));
    },
    onError: (error) => {
      if (error instanceof FileChangedError) toast.error(t('formatChanged'));
      else if (isLoadFailure(error)) toast.error(t('formatLoadFailed'));
      else
        toast.error(
          t('formatFailed', {
            name: support.supported ? support.formatter.name : '',
          })
        );
    },
  });
  return {
    support,
    pending: mutation.isPending,
    format: () => {
      if (!mutation.isPending && support.supported && editable)
        mutation.mutate();
    },
  };
}
