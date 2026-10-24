'use client';
import { Plus } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { classNames as cn } from './class-names';
import { type NewFileError, newFilePathError } from './workbench-layout';

/** Compact file tab strip with inline file creation; no separate form or helper copy. */
export function WorkbenchFiles({
  files,
  active,
  onSelect,
  onAdd,
}: {
  files: readonly string[];
  active: string | undefined;
  onSelect: (path: string) => void;
  /** Absent when the participant may not add files (viewer, Learn problem, offline). */
  onAdd?: (path: string) => void;
}) {
  const t = useTranslations('programmingPlayground');
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<NewFileError | null>(null);
  const cancel = () => {
    setDraft(null);
    setError(null);
  };
  const commit = () => {
    if (draft === null) return;
    if (!draft.trim()) return cancel();
    const problem = newFilePathError(draft, files);
    if (problem) return setError(problem);
    onAdd?.(draft.trim());
    cancel();
  };
  return (
    <div className="flex h-9 shrink-0 items-center gap-1 overflow-x-auto border-b px-1.5">
      <div role="tablist" className="flex items-center gap-0.5">
        {files.map((path) => (
          <button
            key={path}
            type="button"
            role="tab"
            aria-selected={path === active}
            onClick={() => onSelect(path)}
            className={cn(
              'h-7 shrink-0 rounded-md px-2 font-mono text-xs transition-colors',
              path === active
                ? 'bg-muted text-foreground'
                : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
            )}
          >
            {path}
          </button>
        ))}
      </div>
      {onAdd &&
        (draft === null ? (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-7 shrink-0"
            aria-label={t('addFile')}
            onClick={() => setDraft('')}
          >
            <Plus className="size-3.5" />
          </Button>
        ) : (
          <Input
            ref={(node) => node?.focus()}
            aria-label={t('newFile')}
            aria-invalid={!!error}
            placeholder={t('newFile')}
            value={draft}
            className="h-7 w-44 shrink-0 font-mono text-xs"
            onChange={(event) => {
              setDraft(event.target.value);
              setError(null);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                commit();
              } else if (event.key === 'Escape') cancel();
            }}
            onBlur={() => (draft.trim() ? commit() : cancel())}
          />
        ))}
      {error && (
        <span role="alert" className="shrink-0 text-destructive text-xs">
          {t(error === 'duplicate' ? 'fileExists' : 'invalidFile')}
        </span>
      )}
    </div>
  );
}
