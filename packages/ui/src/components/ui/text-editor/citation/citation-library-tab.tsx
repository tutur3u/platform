'use client';

import { useQuery } from '@tanstack/react-query';
import { Pencil, Search, Trash2 } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { LoadingRegion, SkeletonList } from '@tuturuuu/ui/skeleton';
import { useDeferredValue, useId, useState } from 'react';
import type { CitationLabels } from './labels';
import {
  CitationLibraryDeleteDialog,
  CitationLibraryEdit,
} from './citation-library-manage';
import {
  type CitationChoice,
  CitationSourceCard,
} from './citation-source-card';
import type {
  CitationAdapter,
  CitationLibraryAdapter,
  CitationLibraryItem,
} from './types';

interface Props {
  library: CitationLibraryAdapter | undefined;
  isValid: (work: unknown) => boolean;
  labels: CitationLabels;
  onChoose: (choice: CitationChoice) => void;
  renderManualEditor?: CitationAdapter['renderManualEditor'];
  canEditWork?: CitationAdapter['canEditWork'];
}

export function CitationLibraryTab({
  library,
  isValid,
  labels,
  onChoose,
  renderManualEditor,
  canEditWork,
}: Props) {
  const searchId = useId();
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<CitationLibraryItem | null>(null);
  const [deleting, setDeleting] = useState<CitationLibraryItem | null>(null);
  const query = useDeferredValue(search.trim());
  const list = useQuery({
    queryKey: [...(library?.queryKey ?? ['citation-library']), 'list', query],
    queryFn: () => {
      if (!library) throw new Error('Citation library adapter missing');
      return library.list(query);
    },
    enabled: Boolean(library),
    staleTime: 30_000,
    retry: false,
  });

  const update = library?.update;
  const remove = library?.remove;
  if (library && update && renderManualEditor && editing) {
    return (
      <CitationLibraryEdit
        item={editing}
        library={{ ...library, update }}
        renderManualEditor={renderManualEditor}
        labels={labels}
        onDone={() => setEditing(null)}
      />
    );
  }

  const itemActions = (item: CitationLibraryItem) => {
    // Unsupported types and versions stay opaque instead of being downgraded.
    const editable =
      Boolean(update && renderManualEditor) &&
      (canEditWork?.(item.work) ?? false);
    if (!editable && !remove) return undefined;
    const name = item.summary.title || labels.untitled;
    return (
      <>
        {editable && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label={`${labels.editSource}: ${name}`}
            onClick={() => setEditing(item)}
          >
            <Pencil className="size-4" aria-hidden="true" />
          </Button>
        )}
        {remove && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label={`${labels.deleteSource}: ${name}`}
            onClick={() => setDeleting(item)}
          >
            <Trash2 className="size-4" aria-hidden="true" />
          </Button>
        )}
      </>
    );
  };

  const content = (() => {
    if (!library) {
      return <Message>{labels.unavailable.not_provisioned}</Message>;
    }
    if (list.isPending) {
      return (
        <LoadingRegion srLabel={labels.loading} className="space-y-2 py-2">
          <SkeletonList rows={3} withAvatar={false} withTrailing />
        </LoadingRegion>
      );
    }
    if (list.isError) {
      return (
        <Message role="alert">
          {labels.errorGeneric}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => list.refetch()}
          >
            {labels.retry}
          </Button>
        </Message>
      );
    }
    const result = list.data;
    switch (result.status) {
      case 'unavailable':
        return <Message>{labels.unavailable[result.reason]}</Message>;
      case 'error':
        return (
          <Message role="alert">
            {labels.errorGeneric}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => list.refetch()}
            >
              {labels.retry}
            </Button>
          </Message>
        );
      case 'ok':
        if (result.data.length === 0) {
          return (
            <Message>
              {query ? labels.libraryNoMatch : labels.libraryEmpty}
            </Message>
          );
        }
        return (
          <ul className="flex flex-col gap-2">
            {result.data.map((item) => (
              <li key={item.id}>
                <CitationSourceCard
                  summary={item.summary}
                  labels={labels}
                  valid={isValid(item.work)}
                  actions={itemActions(item)}
                  onCite={() =>
                    onChoose({
                      itemId: item.id,
                      work: item.work,
                      libraryVersion: item.version,
                    })
                  }
                />
              </li>
            ))}
          </ul>
        );
      default: {
        const exhaustive: never = result;
        return exhaustive;
      }
    }
  })();

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <label htmlFor={searchId} className="sr-only">
          {labels.librarySearch}
        </label>
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          id={searchId}
          type="search"
          className="pl-9"
          placeholder={labels.librarySearch}
          value={search}
          disabled={!library}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>
      {content}
      {library && remove && (
        <CitationLibraryDeleteDialog
          item={deleting}
          library={{ ...library, remove }}
          labels={labels}
          onOpenChange={(open) => {
            if (!open) setDeleting(null);
          }}
        />
      )}
    </div>
  );
}

function Message({
  children,
  role,
}: {
  children: React.ReactNode;
  role?: 'alert';
}) {
  return (
    <div
      role={role}
      className="flex flex-col items-start gap-2 py-6 text-muted-foreground text-sm"
    >
      {children}
    </div>
  );
}
