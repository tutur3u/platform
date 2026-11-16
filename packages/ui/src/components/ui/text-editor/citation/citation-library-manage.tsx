'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from '@tuturuuu/icons';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@tuturuuu/ui/alert-dialog';
import { Button } from '@tuturuuu/ui/button';
import type { CitationLabels } from './labels';
import type {
  CitationAdapter,
  CitationLibraryAdapter,
  CitationLibraryItem,
  CitationResult,
} from './types';

type Failure = Exclude<CitationResult<unknown>, { status: 'ok' }>;

/** A newer server version rejected the expected one; never overwritten. */
export function isVersionConflict(result: Failure | null) {
  return result?.status === 'error' && /CONFLICT/.test(result.code);
}

function failureText(result: Failure | null, labels: CitationLabels) {
  if (isVersionConflict(result)) return labels.libraryConflict;
  return result?.status === 'unavailable'
    ? labels.unavailable[result.reason]
    : labels.errorGeneric;
}

/**
 * Edits a saved source through the host form, prefilled from its canonical
 * work. The update is sent against the version the edit started from; on a
 * conflict the draft stays on screen and only an explicit discard reloads.
 */
export function CitationLibraryEdit({
  item,
  library,
  renderManualEditor,
  labels,
  onDone,
}: {
  item: CitationLibraryItem;
  library: CitationLibraryAdapter & {
    update: NonNullable<CitationLibraryAdapter['update']>;
  };
  renderManualEditor: NonNullable<CitationAdapter['renderManualEditor']>;
  labels: CitationLabels;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: library.queryKey });
  const update = useMutation({
    mutationFn: (work: unknown) => library.update(item, work),
    retry: false,
    onSuccess: (result) => {
      if (result.status !== 'ok') return;
      void refresh();
      onDone();
    },
  });
  const failure: Failure | null = update.isError
    ? null
    : update.data && update.data.status !== 'ok'
      ? update.data
      : null;
  const failed = update.isError || failure !== null;

  return (
    <div className="flex flex-col gap-3">
      <p className="font-medium text-sm">{labels.editSource}</p>
      {failed && (
        <div className="flex flex-col items-start gap-2" role="alert">
          <p className="text-destructive text-xs">
            {failureText(failure, labels)}
          </p>
          {isVersionConflict(failure) && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                void refresh();
                onDone();
              }}
            >
              {labels.discardAndReload}
            </Button>
          )}
        </div>
      )}
      <fieldset
        disabled={update.isPending}
        aria-busy={update.isPending || undefined}
        className="m-0 min-w-0 border-0 p-0"
      >
        {renderManualEditor({
          draft: null,
          work: item.work,
          submitLabel: labels.saveChanges,
          onSubmit: (work) => update.mutate(work),
          onCancel: onDone,
        })}
      </fieldset>
    </div>
  );
}

/**
 * One explicit confirmation and one request. Only the library item is
 * removed; citations already placed in documents keep their snapshots.
 */
export function CitationLibraryDeleteDialog({
  item,
  library,
  labels,
  onOpenChange,
}: {
  item: CitationLibraryItem | null;
  library: CitationLibraryAdapter & {
    remove: NonNullable<CitationLibraryAdapter['remove']>;
  };
  labels: CitationLabels;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const remove = useMutation({
    mutationFn: (target: CitationLibraryItem) => library.remove(target),
    retry: false,
    onSuccess: (result) => {
      if (result.status !== 'ok') return;
      void queryClient.invalidateQueries({ queryKey: library.queryKey });
      onOpenChange(false);
    },
  });
  const failure =
    remove.variables === item &&
    (remove.isError || (remove.data && remove.data.status !== 'ok'))
      ? ((remove.data as Failure | undefined) ?? null)
      : undefined;

  return (
    <AlertDialog
      open={item !== null}
      onOpenChange={(open) => {
        if (remove.isPending) return;
        if (!open) remove.reset();
        onOpenChange(open);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{labels.deleteSourceTitle}</AlertDialogTitle>
          <AlertDialogDescription>
            {item?.summary.title || labels.untitled}.{' '}
            {labels.deleteSourceDescription}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {failure !== undefined && (
          <p role="alert" className="text-destructive text-sm">
            {failureText(failure, labels)}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={remove.isPending}>
            {labels.cancel}
          </AlertDialogCancel>
          <Button
            type="button"
            variant="destructive"
            disabled={!item || remove.isPending}
            onClick={() => {
              if (item) remove.mutate(item);
            }}
          >
            {remove.isPending && (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            )}
            {labels.deleteSource}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
