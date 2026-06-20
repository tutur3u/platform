'use client';

import { useQuery } from '@tanstack/react-query';
import { FileText, FolderOpen, Loader2, Sparkles, X } from '@tuturuuu/icons';
import { listWorkspaceUserGroupStorageFiles } from '@tuturuuu/internal-api/storage';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useAiGenerate } from './use-ai-generate';

type ModuleStorageEntry = {
  id?: string | null;
  name: string;
  created_at?: string | null;
  updated_at?: string | null;
  last_accessed_at?: string | null;
  metadata?: {
    size?: number | null;
    mimetype?: string | null;
    mimeType?: string | null;
  } | null;
  path?: string | null;
  fullPath?: string | null;
  size?: number | null;
};

function formatBytes(size?: number | null) {
  if (typeof size !== 'number' || Number.isNaN(size)) {
    return '—';
  }

  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }

  return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatDate(value?: string | null) {
  if (!value) {
    return '—';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '—';
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(parsed);
}

function StorageItemRow({
  entry,
  generateMutation,
}: {
  entry: ModuleStorageEntry;
  generateMutation: ReturnType<typeof useAiGenerate>;
}) {
  const t = useTranslations('teachModules.storage');
  const isFolder = !entry.id;
  const size = isFolder
    ? null
    : typeof entry.size === 'number'
      ? entry.size
      : typeof entry.metadata?.size === 'number'
        ? entry.metadata.size
        : null;
  const label = entry.path ?? entry.fullPath ?? entry.name;
  const updatedAt =
    entry.updated_at ?? entry.created_at ?? entry.last_accessed_at;

  const isPending =
    generateMutation.isPending &&
    generateMutation.variables?.fileId === entry.id;

  return (
    <div className="border-2 border-border bg-card px-4 py-3 shadow-[3px_3px_0_var(--border)]">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center border-2 border-border bg-dynamic-cyan/15 shadow-[2px_2px_0_var(--border)]">
          {isFolder ? (
            <FolderOpen className="h-4 w-4" />
          ) : (
            <FileText className="h-4 w-4" />
          )}
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate font-bold text-sm">{entry.name}</p>
          {label !== entry.name ? (
            <p className="mt-1 truncate text-muted-foreground text-xs">
              {label}
            </p>
          ) : null}
          <p className="mt-2 inline-flex border border-border bg-background px-2 py-0.5 font-semibold text-[10px] text-muted-foreground uppercase tracking-[0.16em]">
            {isFolder ? t('kinds.folder') : t('kinds.file')}
          </p>
        </div>

        <div className="mr-2 shrink-0 space-y-1 text-right text-muted-foreground text-xs">
          <p>
            <span className="font-semibold text-foreground">{t('size')}:</span>{' '}
            {formatBytes(size)}
          </p>
          <p>
            <span className="font-semibold text-foreground">
              {t('updatedAt')}:
            </span>{' '}
            {formatDate(updatedAt)}
          </p>
        </div>

        {!isFolder && entry.id && (
          <Button
            variant="ghost"
            size="icon"
            className="flex-shrink-0 border-2 border-transparent text-dynamic-yellow hover:border-border hover:bg-dynamic-yellow/10 hover:text-dynamic-yellow"
            onClick={() =>
              generateMutation.mutate({
                fileId: entry.id!,
              })
            }
            disabled={generateMutation.isPending}
            title={t('generateWithAi')}
            aria-label={t('generateWithAi')}
          >
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
          </Button>
        )}
      </div>
    </div>
  );
}

export function ModuleStorageDialog({
  courseId,
  wsId,
}: {
  courseId: string;
  wsId: string;
}) {
  const t = useTranslations('teachModules.storage');
  const [open, setOpen] = useState(false);
  const generateMutation = useAiGenerate(wsId, courseId);

  const storageQuery = useQuery({
    enabled: open,
    queryKey: ['teach-module-storage', wsId, courseId] as const,
    queryFn: async () =>
      (await listWorkspaceUserGroupStorageFiles(
        wsId,
        courseId
      )) as ModuleStorageEntry[],
  });

  const storageFiles = storageQuery.data ?? [];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          className="inline-flex items-center gap-2 border-2 border-border bg-dynamic-cyan/15 px-4 py-2 font-bold text-sm shadow-[3px_3px_0_var(--border)] transition hover:-translate-y-0.5 hover:shadow-[4px_4px_0_var(--border)] whitespace-nowrap"
          type="button"
        >
          <FolderOpen className="h-4 w-4" />
          {t('button')}
        </button>
      </DialogTrigger>

      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1 text-left">
              <DialogTitle>{t('title')}</DialogTitle>
              <DialogDescription>{t('description')}</DialogDescription>
            </div>

            <div className="flex items-center gap-2">
              <button
                className="inline-flex items-center gap-1.5 border-2 border-border bg-card px-3 py-1.5 font-bold text-sm shadow-[2px_2px_0_var(--border)] transition hover:-translate-y-0.5 hover:shadow-[3px_3px_0_var(--border)] disabled:cursor-not-allowed disabled:opacity-50"
                disabled={storageQuery.isFetching}
                onClick={() => storageQuery.refetch()}
                type="button"
              >
                {storageQuery.isFetching ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : null}
                {t('actions.refresh')}
              </button>
              <button
                className="flex h-9 w-9 items-center justify-center border-2 border-border bg-background shadow-[2px_2px_0_var(--border)] transition hover:-translate-y-0.5 hover:shadow-[3px_3px_0_var(--border)]"
                onClick={() => setOpen(false)}
                type="button"
                aria-label={t('actions.close')}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          {storageQuery.isLoading ? (
            <div className="flex items-center gap-3 border-2 border-border border-dashed bg-muted/50 px-4 py-5 shadow-[3px_3px_0_var(--border)]">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              <div>
                <p className="font-bold text-sm">{t('loading')}</p>
                <p className="text-muted-foreground text-xs">
                  {t('description')}
                </p>
              </div>
            </div>
          ) : storageQuery.isError ? (
            <div className="space-y-3 border-2 border-border border-dashed bg-muted/50 px-4 py-5 shadow-[3px_3px_0_var(--border)]">
              <div>
                <p className="font-bold text-sm">{t('error')}</p>
                <p className="mt-1 text-muted-foreground text-xs">
                  {storageQuery.error instanceof Error
                    ? storageQuery.error.message
                    : t('error')}
                </p>
              </div>
              <button
                className="inline-flex items-center gap-2 border-2 border-border bg-background px-3 py-1.5 font-bold text-sm shadow-[2px_2px_0_var(--border)] transition hover:-translate-y-0.5 hover:shadow-[3px_3px_0_var(--border)]"
                onClick={() => storageQuery.refetch()}
                type="button"
              >
                {t('actions.refresh')}
              </button>
            </div>
          ) : storageFiles.length === 0 ? (
            <div className="flex items-center gap-3 border-2 border-border border-dashed bg-muted/50 px-4 py-5 shadow-[3px_3px_0_var(--border)]">
              <FolderOpen className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="font-bold text-sm">{t('empty')}</p>
                <p className="text-muted-foreground text-xs">
                  {t('description')}
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {storageFiles.map((entry) => (
                <StorageItemRow
                  key={
                    entry.id ??
                    entry.fullPath ??
                    entry.path ??
                    `${entry.name}-${entry.created_at ?? ''}`
                  }
                  entry={entry}
                  generateMutation={generateMutation}
                />
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
