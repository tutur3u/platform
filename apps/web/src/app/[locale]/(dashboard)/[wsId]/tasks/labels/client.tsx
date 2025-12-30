'use client';

import { Plus, Tag } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { DeleteLabelDialog } from './components/delete-label-dialog';
import { LabelDialog } from './components/label-dialog';
import { LabelList } from './components/label-list';
import { useTaskLabels } from './hooks/use-task-labels';
import type { TaskLabel } from './types';

interface Props {
  wsId: string;
  initialLabels: TaskLabel[];
}

export default function TaskLabelsClient({ wsId, initialLabels }: Props) {
  const t = useTranslations('ws-tasks-labels');
  const { labels, isSubmitting, createLabel, updateLabel, deleteLabel } =
    useTaskLabels({ wsId, initialLabels });

  const [isLabelDialogOpen, setIsLabelDialogOpen] = useState(false);
  const [editingLabel, setEditingLabel] = useState<TaskLabel | null>(null);
  const [deletingLabel, setDeletingLabel] = useState<TaskLabel | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredLabels = useMemo(() => {
    if (!searchQuery.trim()) return labels;
    const query = searchQuery.toLowerCase();
    return labels.filter((label) => label.name.toLowerCase().includes(query));
  }, [labels, searchQuery]);

  const handleLabelDialogSubmit = async (data: {
    name: string;
    color: string;
  }) => {
    const result = editingLabel
      ? await updateLabel(editingLabel.id, data)
      : await createLabel(data);

    if (result.success) {
      toast.success(editingLabel ? t('success_update') : t('success_create'));
      setIsLabelDialogOpen(false);
      setEditingLabel(null);
    } else {
      toast.error(editingLabel ? t('error_update') : t('error_create'));
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deletingLabel) return;
    const result = await deleteLabel(deletingLabel.id);
    if (result.success) {
      toast.success(t('success_delete'));
      setDeletingLabel(null);
    } else {
      toast.error(t('error_delete'));
    }
  };

  const openCreateDialog = () => {
    setEditingLabel(null);
    setIsLabelDialogOpen(true);
  };

  const openEditDialog = (label: TaskLabel) => {
    setEditingLabel(label);
    setIsLabelDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Action Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Tag className="h-4 w-4" />
            <span>{t('count_labels', { count: labels.length })}</span>
          </div>
          {labels.length > 0 && (
            <div className="relative flex-1 sm:w-64">
              <Input
                placeholder={t('search_placeholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
              <Tag className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            </div>
          )}
        </div>

        <Button onClick={openCreateDialog}>
          <Plus className="mr-2 h-4 w-4" />
          {t('create_label')}
        </Button>
      </div>

      {/* Labels Grid */}
      <LabelList
        labels={labels}
        filteredLabels={filteredLabels}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onCreateClick={openCreateDialog}
        onEditClick={openEditDialog}
        onDeleteClick={setDeletingLabel}
      />

      {/* Create/Edit Dialog */}
      <LabelDialog
        label={editingLabel}
        open={isLabelDialogOpen}
        onOpenChange={setIsLabelDialogOpen}
        onSubmit={handleLabelDialogSubmit}
        isSubmitting={isSubmitting}
      />

      {/* Delete Confirmation Dialog */}
      <DeleteLabelDialog
        label={deletingLabel}
        open={!!deletingLabel}
        onOpenChange={(open) => !open && setDeletingLabel(null)}
        onConfirm={handleDeleteConfirm}
      />
    </div>
  );
}

