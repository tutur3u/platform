'use client';

import { Layers3, Palette, Plus, Search, Tag } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';

import { useTranslations } from 'next-intl';
import { type ReactNode, useMemo, useState } from 'react';
import { DeleteLabelDialog } from './components/delete-label-dialog';
import { LabelDialog } from './components/label-dialog';
import { LabelList } from './components/label-list';
import { useTaskLabels } from './hooks/use-task-labels';
import { colorPresets, type TaskLabel } from './types';

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

  const uniqueColorCount = useMemo(
    () => new Set(labels.map((label) => label.color.toLowerCase())).size,
    [labels]
  );

  const palettePreviewColors = useMemo(() => {
    const colors = labels.map((label) => label.color);
    return colors.length > 0 ? colors.slice(0, 12) : colorPresets.slice(0, 12);
  }, [labels]);

  const handleLabelDialogSubmit = async (data: {
    name: string;
    color: string;
  }) => {
    try {
      if (editingLabel) {
        await updateLabel(editingLabel.id, data);
      } else {
        await createLabel(data);
      }
      setIsLabelDialogOpen(false);
      setEditingLabel(null);
    } catch (_error) {
      // Error handled by hook
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deletingLabel) return;
    try {
      await deleteLabel(deletingLabel.id);
      setDeletingLabel(null);
    } catch (_error) {
      // Error handled by hook
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
    <div className="space-y-5">
      <section className="overflow-hidden rounded-lg border bg-background">
        <div className="flex h-2 w-full">
          {palettePreviewColors.map((color, index) => (
            <div
              className="min-w-0 flex-1"
              key={`${color}-${index}`}
              style={{ backgroundColor: color }}
            />
          ))}
        </div>
        <div className="grid gap-6 p-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div className="flex items-start gap-4">
            <div className="rounded-md border bg-muted p-3">
              <Palette className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="min-w-0 space-y-2">
              <p className="font-medium text-muted-foreground text-sm">
                {t('palette_title')}
              </p>
              <div className="space-y-1">
                <h1 className="font-semibold text-3xl tracking-tight">
                  {t('header')}
                </h1>
                <p className="max-w-2xl text-muted-foreground">
                  {t('description')}
                </p>
              </div>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-3 lg:min-w-[30rem]">
            <MetricTile
              icon={<Tag className="h-4 w-4" />}
              label={t('total_labels')}
              value={labels.length}
            />
            <MetricTile
              icon={<Search className="h-4 w-4" />}
              label={t('visible_labels')}
              value={filteredLabels.length}
            />
            <MetricTile
              icon={<Layers3 className="h-4 w-4" />}
              label={t('unique_colors')}
              value={uniqueColorCount}
            />
          </div>
        </div>
      </section>

      <div className="flex flex-col gap-3 rounded-lg border bg-background p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t('search_placeholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-3">
          <span className="whitespace-nowrap text-muted-foreground text-sm">
            {t('count_labels', { count: labels.length })}
          </span>
          <Button onClick={openCreateDialog}>
            <Plus className="mr-2 h-4 w-4" />
            {t('create_label')}
          </Button>
        </div>
      </div>

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
      <DeleteLabelDialog
        label={deletingLabel}
        open={!!deletingLabel}
        onOpenChange={(open) => !open && setDeletingLabel(null)}
        onConfirm={handleDeleteConfirm}
      />
    </div>
  );
}

function MetricTile({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-md border bg-muted/30 p-3">
      <div className="mb-2 flex items-center gap-2 text-muted-foreground text-xs">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <p className="font-semibold text-2xl tabular-nums">{value}</p>
    </div>
  );
}
