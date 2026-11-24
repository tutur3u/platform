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
import { Empty } from '@tuturuuu/ui/empty';
import { useTranslations } from 'next-intl';
import type { DriveTypeFilter } from './drive-file-kind';

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
    <Empty
      headingLevel={2}
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
      announce
      dashed
      description={t(`states.${key}_description`)}
      icon={inFolder ? FolderOpen : CloudUpload}
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
    <Empty
      headingLevel={2}
      action={
        <Button onClick={onClear} type="button" variant="outline">
          {t('states.clear_filters')}
        </Button>
      }
      announce
      description={t('states.no_results_description')}
      icon={SearchX}
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
    <Empty
      headingLevel={2}
      action={
        <Button onClick={onClear} type="button" variant="outline">
          {t('states.clear_filters')}
        </Button>
      }
      announce
      description={t('states.filtering_more_description')}
      icon={ListFilter}
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
    <Empty
      headingLevel={2}
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
      icon={TriangleAlert}
      role="alert"
      title={t('states.error_title')}
    />
  );
}

export function DriveDeniedState() {
  const t = useTranslations('drive');

  return (
    <Empty
      headingLevel={2}
      description={t('denied.description')}
      icon={Lock}
      role="alert"
      title={t('denied.title')}
    />
  );
}
