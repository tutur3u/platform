'use client';
import { FileCode, Folder, Plus } from '@tuturuuu/icons';
import type { CollaborationPresence } from '@tuturuuu/realtime';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { useTranslations } from 'next-intl';
import { type ReactNode, useState } from 'react';
import { classNames as cn } from './class-names';
import { MiraFileBadge } from './mira-code-presence';
import {
  LANGUAGE_CODES,
  LANGUAGE_LABELS,
  LANGUAGE_TONES,
  languageForPath,
} from './workbench-language';
import { type NewFileError, newFilePathError } from './workbench-layout';

/** Compact file tab strip with inline file creation; no separate form or helper copy. */
export function WorkbenchFiles({
  files,
  active,
  onSelect,
  onAdd,
  collaborators = [],
  miraFile,
  miraMark,
  languageBadge = false,
}: {
  files: readonly string[];
  active: string | undefined;
  onSelect: (path: string) => void;
  collaborators?: CollaborationPresence[];
  miraFile?: string;
  miraMark?: ReactNode;
  /** Marks the active tab with its runtime's short code (PY, JS, C++). */
  languageBadge?: boolean;
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
              'flex h-7 shrink-0 items-center gap-1.5 rounded-full px-2 font-mono text-xs transition-colors motion-reduce:transition-none',
              path === active
                ? 'bg-muted text-foreground'
                : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
            )}
          >
            {path}
            {languageBadge && path === active && <LanguageBadge path={path} />}
            {miraFile === path && (
              <MiraFileBadge
                label={t('miraFileOpen', { path })}
                mark={miraMark}
              />
            )}
            <FileCollaborators path={path} collaborators={collaborators} />
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

function LanguageBadge({ path }: { path: string }) {
  const language = languageForPath(path);
  if (!language) return null;
  return (
    <span
      data-language={language}
      title={LANGUAGE_LABELS[language]}
      className={cn(
        'rounded-sm px-1 font-bold font-sans text-[10px] leading-4',
        LANGUAGE_TONES[language]
      )}
    >
      <span aria-hidden="true">{LANGUAGE_CODES[language]}</span>
      <span className="sr-only">, {LANGUAGE_LABELS[language]}</span>
    </span>
  );
}

function FileCollaborators({
  path,
  collaborators,
}: {
  path: string;
  collaborators: CollaborationPresence[];
}) {
  const names = [
    ...new Set(
      collaborators
        .filter((person) => person.file === path)
        .map((person) => person.displayName)
    ),
  ];
  return (
    names.length > 0 && (
      <span className="flex -space-x-0.5" aria-label={names.join(', ')}>
        {names.slice(0, 3).map((name) => (
          <CollaboratorAvatar key={name} name={name} />
        ))}
        {names.length > 3 && (
          <span className="self-center bg-card px-1 text-muted-foreground">
            +{names.length - 3}
          </span>
        )}
      </span>
    )
  );
}

function CollaboratorAvatar({ name }: { name: string }) {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => Array.from(word)[0])
    .join('')
    .toLocaleUpperCase();
  return (
    <span
      title={name}
      aria-hidden="true"
      className="grid size-5 shrink-0 place-items-center rounded-full border border-background bg-accent font-sans font-bold text-accent-foreground text-[9px]"
    >
      {initials}
    </span>
  );
}

export function WorkbenchFileTree({
  files,
  active,
  onSelect,
  collaborators,
  miraFile,
  miraMark,
}: {
  files: readonly string[];
  active?: string;
  onSelect: (path: string) => void;
  collaborators: CollaborationPresence[];
  miraFile?: string;
  miraMark?: ReactNode;
}) {
  const t = useTranslations('programmingPlayground');
  return (
    <aside
      aria-label={t('files')}
      className="hidden min-h-0 w-44 shrink-0 flex-col overflow-auto rounded-[var(--radius-xl)] border bg-card @6xl:flex"
    >
      <h3 className="flex items-center gap-2 px-3 py-2 font-bold text-sm">
        <Folder className="size-4" />
        {t('files')}
      </h3>
      <ul className="px-1.5 pb-2">
        {files.map((path) => (
          <li key={path}>
            <button
              type="button"
              aria-current={path === active || undefined}
              onClick={() => onSelect(path)}
              className="flex w-full min-w-0 items-center gap-1.5 rounded-[var(--radius)] px-2 py-1.5 text-left font-mono text-xs transition-colors hover:bg-muted aria-current:bg-accent motion-reduce:transition-none"
            >
              <FileCode className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate" title={path}>
                {path}
              </span>
              {miraFile === path && (
                <MiraFileBadge
                  label={t('miraFileOpen', { path })}
                  mark={miraMark}
                />
              )}
              <FileCollaborators path={path} collaborators={collaborators} />
            </button>
          </li>
        ))}
      </ul>
      {(miraFile || collaborators.length > 0) && (
        <div className="border-t px-2 py-2">
          <h3 className="px-1 font-semibold text-muted-foreground text-xs">
            {t('inSession')}
          </h3>
          {miraFile && (
            <div className="mt-1 flex items-center gap-2 rounded-[var(--radius)] bg-calendar-bg-purple px-2 py-1.5 text-dynamic-purple">
              <MiraFileBadge
                label={t('miraFileOpen', { path: miraFile })}
                mark={miraMark}
              />
              <div className="min-w-0 text-xs">
                <div className="font-bold">{t('miraName')}</div>
                <div className="truncate font-mono" title={miraFile}>
                  {miraFile}
                </div>
              </div>
            </div>
          )}
          {collaborators.map((person) => (
            <div
              key={person.connectionId}
              className="flex min-w-0 items-center gap-2 px-2 py-1"
            >
              <CollaboratorAvatar name={person.displayName} />
              <div className="min-w-0 text-xs">
                <div
                  className="truncate font-semibold"
                  title={person.displayName}
                >
                  {person.displayName}
                </div>
                {person.file && (
                  <div
                    className="truncate font-mono text-muted-foreground"
                    title={person.file}
                  >
                    {person.file}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </aside>
  );
}
