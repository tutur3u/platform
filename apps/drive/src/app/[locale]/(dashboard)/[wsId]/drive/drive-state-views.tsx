'use client';

import {
  CloudUpload,
  FolderOpen,
  Lock,
  RefreshCw,
  SearchX,
  TriangleAlert,
} from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import type { DriveViewMode } from './search-params';

export function DriveLoadingState({ view }: { view: DriveViewMode }) {
  const t = useTranslations('drive');

  return (
    <div aria-busy="true" className="space-y-6" role="status">
      <span className="sr-only">{t('states.loading')}</span>
      {view === 'grid' ? (
        <>
          <div className="space-y-3">
            <Skeleton className="h-4 w-16" />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(13.75rem,1fr))]">
              {Array.from({ length: 4 }, (_, index) => (
                <Skeleton className="h-16 rounded-2xl" key={index} />
              ))}
            </div>
          </div>
          <div className="space-y-3">
            <Skeleton className="h-4 w-12" />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(12.5rem,1fr))] md:gap-4">
              {Array.from({ length: 8 }, (_, index) => (
                <Skeleton className="aspect-[4/3.9] rounded-2xl" key={index} />
              ))}
            </div>
          </div>
        </>
      ) : (
        <div className="space-y-px overflow-hidden rounded-2xl border border-border bg-card">
          {Array.from({ length: 8 }, (_, index) => (
            <div className="flex h-14 items-center gap-3 px-3" key={index}>
              <Skeleton className="size-4 rounded" />
              <Skeleton className="size-8 rounded-lg" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="hidden h-4 w-24 md:block" />
              <Skeleton className="hidden h-4 w-16 sm:block" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

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
  onUpload,
}: {
  canManage: boolean;
  inFolder: boolean;
  onUpload: () => void;
}) {
  const t = useTranslations('drive');
  const key = inFolder ? 'empty_folder' : 'empty_root';

  return (
    <StateMessage
      action={
        canManage ? (
          <Button onClick={onUpload} type="button">
            <CloudUpload className="size-4" />
            {t('actions.upload')}
          </Button>
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

export function DriveErrorState({ onRetry }: { onRetry: () => void }) {
  const t = useTranslations('drive');

  return (
    <StateMessage
      action={
        <Button onClick={onRetry} type="button" variant="outline">
          <RefreshCw className="size-4" />
          {t('states.retry')}
        </Button>
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
