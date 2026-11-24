'use client';

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@tuturuuu/ui/breadcrumb';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { Fragment } from 'react';
import { getPathSegments } from './drive-selection';
import { getStoragePathSegmentDisplayName } from './storage-display-name';

interface DriveBreadcrumbsProps {
  path: string;
  onNavigate: (path: string) => void;
}

/** The folder trail; the current folder is the page heading. */
export default function DriveBreadcrumbs({
  path,
  onNavigate,
}: DriveBreadcrumbsProps) {
  const t = useTranslations('drive');
  const segments = getPathSegments(path);
  const trail = [
    { label: t('files'), path: '' },
    ...segments.map((segment, index) => ({
      label: getStoragePathSegmentDisplayName(segment),
      path: segments.slice(0, index + 1).join('/'),
    })),
  ];
  const current = trail.at(-1);
  const parents = trail.slice(0, -1);

  return (
    <Breadcrumb aria-label={t('breadcrumb')} className="flex min-w-0 flex-1">
      {/* One line: parents truncate first; phones keep only the nearest one. */}
      <BreadcrumbList className="min-w-0 flex-nowrap sm:gap-1.5">
        {parents.map((crumb, index) => (
          <Fragment key={crumb.path}>
            <BreadcrumbItem
              className={cn(
                'min-w-0 shrink-[100]',
                index < parents.length - 1 && 'hidden sm:inline-flex'
              )}
            >
              <BreadcrumbLink asChild>
                <button
                  className="max-w-40 truncate rounded-md py-1 font-semibold focus-visible:outline-2 focus-visible:outline-ring"
                  onClick={() => onNavigate(crumb.path)}
                  type="button"
                >
                  {crumb.label}
                </button>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator
              className={cn(
                index < parents.length - 1 && 'hidden sm:inline-flex'
              )}
            />
          </Fragment>
        ))}
        <BreadcrumbItem className="min-w-0">
          <h1 className="min-w-0 truncate text-xl tracking-tight">
            <BreadcrumbPage className="font-semibold">
              {current?.label}
            </BreadcrumbPage>
          </h1>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  );
}
