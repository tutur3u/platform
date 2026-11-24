'use client';
import { useMutation } from '@tanstack/react-query';
import { replaceProgrammingText } from '@tuturuuu/realtime';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import type * as Y from 'yjs';
import { type FormatSupport, formatSupport } from './format/formatters';
import { type EditorSelectionHandle, keepSelection } from './format/selection';

class FileChangedError extends Error {}

const describe = (error: unknown) =>
  error instanceof Error ? `${error.name} ${error.message}` : String(error);

/**
 * A module or its binary that could not be fetched: the person is offline or a
 * chunk is gone. Only fetch and chunk-load failures count; a formatter that ran
 * and rejected the file, whatever it threw, is not one.
 */
const isLoadFailure = (error: unknown) =>
  /Failed to fetch|NetworkError|Load failed|fetch failed|dynamically imported module|Importing a module script failed|Loading chunk|ChunkLoadError/i.test(
    describe(error)
  );

/**
 * The page's Content Security Policy refused to compile the formatter's
 * WebAssembly. Chromium reports it as a `CompileError`, or for Prettier Java as
 * a `RuntimeError` that aborted on one, naming the policy.
 */
const isPolicyBlock = (error: unknown) =>
  (error instanceof Error && error.name === 'SecurityError') ||
  /Content Security Policy|wasm-eval|unsafe-eval|CompileError: WebAssembly/i.test(
    describe(error)
  );

/**
 * Formats the open file for the whole room as one edit: the formatter runs
 * on the shared text, and its result is written back in a single Yjs
 * transaction, so there is one update to send and one step to undo. If
 * someone else edits the file while the formatter runs, nothing is written,
 * because the result would overwrite their change. The caret and selection
 * stay on the same text: they are held as shared-document positions across
 * the write and put back once the editor shows the formatted file.
 */
export function useWorkbenchFormat({
  doc,
  path,
  editable,
  editor,
}: {
  doc: Y.Doc | undefined;
  path: string | undefined;
  editable: boolean;
  editor?: { current: EditorSelectionHandle | null };
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
      // The shared file is the one that was read, and nobody edited it since.
      if (
        doc.getMap<Y.Text>('files').get(path) !== text ||
        text.toString() !== before
      )
        throw new FileChangedError();
      if (after === before) return 'unchanged';
      const handle = editor?.current ?? null;
      const selection = keepSelection(
        text,
        handle?.getSelection() ?? null,
        () => replaceProgrammingText(text, after, 'format')
      );
      if (selection) handle?.setSelection(selection, after);
      return 'formatted';
    },
    onSuccess: (result) => {
      if (result === 'unchanged') toast(t('formatAlready'));
    },
    onError: (error) => {
      // The original failure stays in the console; the toast only says what to do.
      console.warn('Format failed', error);
      if (error instanceof FileChangedError) toast.error(t('formatChanged'));
      else if (isPolicyBlock(error)) toast.error(t('formatBlocked'));
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
