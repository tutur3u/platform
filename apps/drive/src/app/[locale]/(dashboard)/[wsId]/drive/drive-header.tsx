'use client';

import { FolderPlus, Search, Upload, X } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import DriveBreadcrumbs from './breadcrumbs';

interface DriveHeaderProps {
  canManage: boolean;
  onNavigate: (path: string) => void;
  onNewFolder: () => void;
  onQueryChange: (query: string) => void;
  onUpload: () => void;
  path: string;
  query: string;
}

/** Explains why a write control is unavailable instead of hiding it. */
export function DeniedReason({
  children,
  denied,
}: {
  children: ReactNode;
  denied: boolean;
}) {
  const t = useTranslations('drive');
  if (!denied) return children;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* A disabled button gets no pointer events, so the span holds the tooltip. */}
        <span tabIndex={0}>{children}</span>
      </TooltipTrigger>
      <TooltipContent>{t('denied.write_reason')}</TooltipContent>
    </Tooltip>
  );
}

export function DriveHeader({
  canManage,
  onNavigate,
  onNewFolder,
  onQueryChange,
  onUpload,
  path,
  query,
}: DriveHeaderProps) {
  const t = useTranslations('drive');

  return (
    <header className="flex flex-wrap items-center gap-3 border-border border-b pb-4">
      <DriveBreadcrumbs path={path} onNavigate={onNavigate} />
      <div className="relative w-full md:w-80 lg:w-96">
        <Search
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          aria-label={t('search.label')}
          className="h-10 pr-9 pl-9 [&::-webkit-search-cancel-button]:appearance-none"
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={t('search.placeholder')}
          type="search"
          value={query}
        />
        {query ? (
          <Button
            aria-label={t('search.clear')}
            className="absolute top-1/2 right-1 size-8 -translate-y-1/2"
            onClick={() => onQueryChange('')}
            size="icon"
            type="button"
            variant="ghost"
          >
            <X className="size-4" />
          </Button>
        ) : null}
      </div>
      <div className="hidden items-center gap-2 md:flex">
        <DeniedReason denied={!canManage}>
          <Button
            disabled={!canManage}
            onClick={onNewFolder}
            type="button"
            variant="outline"
          >
            <FolderPlus className="size-4" />
            {t('actions.new_folder')}
          </Button>
        </DeniedReason>
        <DeniedReason denied={!canManage}>
          <Button disabled={!canManage} onClick={onUpload} type="button">
            <Upload className="size-4" />
            {t('actions.upload')}
          </Button>
        </DeniedReason>
      </div>
    </header>
  );
}
