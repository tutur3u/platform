'use client';

import { Archive, Plus } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent } from '@tuturuuu/ui/card';
import { useTranslations } from 'next-intl';

interface ProjectsEmptyStateProps {
  hasFilters: boolean;
  onCreateClick: () => void;
}

export function ProjectsEmptyState({
  hasFilters,
  onCreateClick,
}: ProjectsEmptyStateProps) {
  const t = useTranslations('task-projects.empty_state');

  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-12">
        <Archive className="h-12 w-12 text-muted-foreground" />
        <h3 className="mt-4 font-semibold text-lg">
          {hasFilters ? t('no_projects_found') : t('no_projects_yet')}
        </h3>
        <p className="text-center text-muted-foreground">
          {hasFilters ? t('adjust_filters') : t('create_first_project')}
        </p>
        {!hasFilters && (
          <Button className="mt-4" onClick={onCreateClick}>
            <Plus className="mr-2 h-4 w-4" />
            {t('create_project')}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
