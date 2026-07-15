import { Plus, Search, Tag } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import type { TaskLabel } from '../types';
import { LabelCard } from './label-card';

interface LabelListProps {
  labels: TaskLabel[];
  filteredLabels: TaskLabel[];
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onCreateClick: () => void;
  onEditClick: (label: TaskLabel) => void;
  onDeleteClick: (label: TaskLabel) => void;
}

export function LabelList({
  labels,
  filteredLabels,
  searchQuery,
  onSearchChange,
  onCreateClick,
  onEditClick,
  onDeleteClick,
}: LabelListProps) {
  const t = useTranslations('ws-tasks-labels');

  if (labels.length === 0) {
    return (
      <div className="rounded-lg border bg-background p-10 text-center">
        <div className="mx-auto flex max-w-md flex-col items-center gap-5">
          <div className="rounded-md border bg-muted p-4">
            <Tag className="h-8 w-8 text-muted-foreground" />
          </div>
          <div className="space-y-2">
            <h3 className="font-semibold text-xl">{t('no_labels')}</h3>
            <p className="text-muted-foreground">
              {t('no_labels_description')}
            </p>
          </div>
          <Button onClick={onCreateClick} size="lg">
            <Plus className="mr-2 h-4 w-4" />
            {t('create_first_label')}
          </Button>
        </div>
      </div>
    );
  }

  if (filteredLabels.length === 0) {
    return (
      <div className="rounded-lg border bg-background p-10 text-center">
        <div className="mx-auto flex max-w-md flex-col items-center gap-5">
          <div className="rounded-md border bg-muted p-4">
            <Search className="h-8 w-8 text-muted-foreground" />
          </div>
          <div className="space-y-2">
            <h3 className="font-semibold text-xl">{t('no_results')}</h3>
            <p className="text-muted-foreground">
              {t('no_results_description', { query: searchQuery })}
            </p>
          </div>
          <Button variant="outline" onClick={() => onSearchChange('')}>
            {t('clear_search')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
      {filteredLabels.map((label) => (
        <LabelCard
          key={label.id}
          label={label}
          onEdit={onEditClick}
          onDelete={onDeleteClick}
        />
      ))}
    </div>
  );
}
