'use client';

import {
  CloudUpload,
  FolderOpen,
  FolderPlus,
  HardDrive,
  ListFilter,
  Lock,
  RefreshCw,
  SearchX,
  TriangleAlert,
} from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import type { DriveTypeFilter } from './drive-file-kind';

function StateMessage({
  action,
  description,
  icon,
  role,
  title,
}: {
  action?: ReactNode;
  description: string;
  icon: ReactNode;
  role?: 'alert';
  title: string;
}) {
  return (
    <div
      className="flex flex-col items-center gap-4 rounded-2xl border border-border border-dashed px-6 py-16 text-center"
      role={role}
    >
      <span className="flex size-14 items-center justify-center rounded-2xl bg-accent text-muted-foreground [&_svg]:size-6">
        {icon}
      </span>
      <div className="max-w-md space-y-1">
        <h2 className="font-bold text-lg">{title}</h2>
        <p className="text-muted-foreground text-sm">{description}</p>
      </div>
      {action}
    </div>
  );
}

export function DriveEmptyState({
  canManage,
  inFolder,
  onNewFolder,
  onUpload,
}: {
  canManage: boolean;
  inFolder: boolean;
  onNewFolder: () => void;
  onUpload: () => void;
}) {
  const t = useTranslations('drive');
  const key = inFolder ? 'empty_folder' : 'empty_root';

  return (
    <StateMessage
      action={
        canManage ? (
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={onUpload} type="button">
              <CloudUpload className="size-4" />
              {t('actions.upload')}
            </Button>
            <Button onClick={onNewFolder} type="button" variant="outline">
              <FolderPlus className="size-4" />
              {t('actions.new_folder')}
            </Button>
          </div>
        ) : undefined
      }
      description={t(`states.${key}_description`)}
      icon={inFolder ? <FolderOpen /> : <CloudUpload />}
      title={t(`states.${key}_title`)}
    />
  );
}

export function DriveNoResultsState({
  onClear,
  query,
}: {
  onClear: () => void;
  query: string;
}) {
  const t = useTranslations('drive');

  return (
    <StateMessage
      action={
        <Button onClick={onClear} type="button" variant="outline">
          {t('states.clear_filters')}
        </Button>
      }
      description={t('states.no_results_description')}
      icon={<SearchX />}
      title={
        query
          ? t('states.no_results_query', { query })
          : t('states.no_results_title')
      }
    />
  );
}

/**
 * The type chip matched nothing in the loaded pages. Later pages may match,
 * so this offers more pages instead of claiming there are no results.
 */
export function DriveFilteringMoreState({
  onClear,
  type,
}: {
  onClear: () => void;
  type: DriveTypeFilter;
}) {
  const t = useTranslations('drive');

  return (
    <StateMessage
      action={
        <Button onClick={onClear} type="button" variant="outline">
          {t('states.clear_filters')}
        </Button>
      }
      description={t('states.filtering_more_description')}
      icon={<ListFilter />}
      title={t('states.filtering_more_title', {
        kind: t(`chips.${type}`),
      })}
    />
  );
}

export function DriveErrorState({
  inFolder,
  onGoHome,
  onRetry,
}: {
  inFolder: boolean;
  onGoHome: () => void;
  onRetry: () => void;
}) {
  const t = useTranslations('drive');

  return (
    <StateMessage
      action={
        <div className="flex flex-wrap justify-center gap-2">
          <Button onClick={onRetry} type="button" variant="outline">
            <RefreshCw className="size-4" />
            {t('states.retry')}
          </Button>
          {inFolder ? (
            <Button onClick={onGoHome} type="button" variant="ghost">
              <HardDrive className="size-4" />
              {t('states.go_to_files')}
            </Button>
          ) : null}
        </div>
      }
      description={t('states.error_description')}
      icon={<TriangleAlert />}
      role="alert"
      title={t('states.error_title')}
    />
  );
}

export function DriveDeniedState() {
  const t = useTranslations('drive');

  return (
    <StateMessage
      description={t('denied.description')}
      icon={<Lock />}
      role="alert"
      title={t('denied.title')}
    />
  );
}
