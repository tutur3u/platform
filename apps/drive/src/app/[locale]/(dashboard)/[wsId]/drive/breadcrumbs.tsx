'use client';

import { ArrowLeft, ChevronRight, Folder } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { ScrollArea, ScrollBar } from '@tuturuuu/ui/scroll-area';
import { useTranslations } from 'next-intl';
import { getStoragePathSegmentDisplayName } from './storage-display-name';

interface DriveBreadcrumbsProps {
  path: string;
  onNavigate: (path: string) => void;
  onNavigateUp?: () => void;
}

export default function DriveBreadcrumbs({
  path,
  onNavigate,
  onNavigateUp,
}: DriveBreadcrumbsProps) {
  const t = useTranslations('ws-storage-objects');
  const pathSegments = path.split('/').filter(Boolean);

  return (
    <ScrollArea className="w-full whitespace-nowrap">
      <div className="flex min-h-11 items-center gap-2 rounded-[22px] border border-dynamic-border/80 bg-muted/25 px-3 py-2">
        {pathSegments.length > 0 && onNavigateUp ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 rounded-xl"
            onClick={onNavigateUp}
            aria-label={t('go_back')}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
        ) : null}

        <Button
          type="button"
          variant={pathSegments.length === 0 ? 'default' : 'ghost'}
          className="h-8 rounded-xl"
          onClick={() => onNavigate('')}
        >
          <Folder className="mr-2 h-4 w-4" />
          {t('root_label')}
        </Button>

        {pathSegments.map((segment, index) => {
          const nextPath = pathSegments.slice(0, index + 1).join('/');
          const isCurrent = index === pathSegments.length - 1;

          return (
            <div key={nextPath} className="flex items-center gap-2">
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
              <Button
                type="button"
                variant={isCurrent ? 'default' : 'ghost'}
                className="h-8 rounded-xl"
                onClick={() => onNavigate(nextPath)}
              >
                {getStoragePathSegmentDisplayName(segment)}
              </Button>
            </div>
          );
        })}
      </div>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  );
}
