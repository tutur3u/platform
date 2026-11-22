'use client';

import { ChevronRight } from '@tuturuuu/icons';
import { useTranslations } from 'next-intl';
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
    <nav
      aria-label={t('breadcrumb')}
      className="flex min-w-0 flex-1 items-center gap-1"
    >
      <ol className="flex min-w-0 items-center gap-1">
        {parents.map((crumb) => (
          <li key={crumb.path} className="flex min-w-0 items-center gap-1">
            <button
              type="button"
              className="max-w-40 truncate rounded-full px-2 py-1 font-semibold text-muted-foreground text-sm hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
              onClick={() => onNavigate(crumb.path)}
            >
              {crumb.label}
            </button>
            <ChevronRight
              aria-hidden
              className="size-3.5 shrink-0 text-muted-foreground"
            />
          </li>
        ))}
        <li className="min-w-0">
          <h1
            aria-current="page"
            className="truncate px-2 font-bold text-xl tracking-tight"
          >
            {current?.label}
          </h1>
        </li>
      </ol>
    </nav>
  );
}
