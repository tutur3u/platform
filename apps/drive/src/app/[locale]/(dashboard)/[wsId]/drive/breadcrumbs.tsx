'use client';

import {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@tuturuuu/ui/breadcrumb';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
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
  // Phones show only the nearest parent; the rest open from the ellipsis.
  const hidden = parents.slice(0, -1);

  return (
    <Breadcrumb aria-label={t('breadcrumb')} className="flex min-w-0 flex-1">
      {/* One line: parents truncate first; phones keep only the nearest one. */}
      <BreadcrumbList className="min-w-0 flex-nowrap sm:gap-1.5">
        {hidden.length > 0 ? (
          <>
            <BreadcrumbItem className="sm:hidden">
              <DropdownMenu>
                <DropdownMenuTrigger
                  aria-label={t('breadcrumb_more')}
                  className="flex items-center justify-center rounded-md focus-visible:outline-2 focus-visible:outline-ring pointer-coarse:size-11"
                >
                  <BreadcrumbEllipsis className="size-7" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {hidden.map((crumb) => (
                    <DropdownMenuItem
                      key={crumb.path}
                      onSelect={() => onNavigate(crumb.path)}
                    >
                      {crumb.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </BreadcrumbItem>
            <BreadcrumbSeparator className="sm:hidden" />
          </>
        ) : null}
        {parents.map((crumb, index) => (
          <Fragment key={crumb.path}>
            <BreadcrumbItem
              className={cn(
                'min-w-0 shrink-[100]',
                index < parents.length - 1 && 'hidden sm:inline-flex'
              )}
            >
              <BreadcrumbLink asChild>
                {/* The label truncates, not the button, so the touch hit area is not clipped. */}
                <button
                  className="flex min-w-0 max-w-40 rounded-md py-1 font-semibold focus-visible:outline-2 focus-visible:outline-ring"
                  onClick={() => onNavigate(crumb.path)}
                  type="button"
                >
                  <span className="truncate">{crumb.label}</span>
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
