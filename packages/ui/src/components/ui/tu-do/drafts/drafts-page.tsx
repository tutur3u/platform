'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText } from '@tuturuuu/icons';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useTaskDialogContext } from '../providers/task-dialog-provider';
import { DraftCard, type TaskDraft } from './draft-card';
import { DraftConvertDialog } from './draft-convert-dialog';

interface DraftsPageProps {
  wsId: string;
}

export function DraftsPage({ wsId }: DraftsPageProps) {
  const t = useTranslations('task-drafts');
  const queryClient = useQueryClient();
  const { editDraft } = useTaskDialogContext();
  const [convertDraft, setConvertDraft] = useState<TaskDraft | null>(null);

  const { data: drafts = [], isLoading } = useQuery<TaskDraft[]>({
    queryKey: ['task-drafts', wsId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/workspaces/${wsId}/task-drafts`);
      if (!res.ok) throw new Error('Failed to fetch drafts');
      const json = await res.json();
      return json.data;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (draftId: string) => {
      const res = await fetch(
        `/api/v1/workspaces/${wsId}/task-drafts/${draftId}`,
        { method: 'DELETE' }
      );
      if (!res.ok) throw new Error('Failed to delete draft');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task-drafts', wsId] });
      toast.success(t('deleted_success'));
    },
    onError: () => {
      toast.error('Failed to delete draft');
    },
  });

  const handleConverted = () => {
    queryClient.invalidateQueries({ queryKey: ['task-drafts', wsId] });
    setConvertDraft(null);
  };

  const handleEdit = (draft: TaskDraft) => {
    editDraft(draft);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (drafts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <FileText className="h-12 w-12 text-muted-foreground/50" />
        <div>
          <h3 className="font-medium text-muted-foreground">{t('empty')}</h3>
          <p className="mt-1 max-w-sm text-muted-foreground/70 text-sm">
            {t('empty_description')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {drafts.map((draft) => (
          <DraftCard
            key={draft.id}
            draft={draft}
            onConvert={setConvertDraft}
            onEdit={handleEdit}
            onClick={handleEdit}
            onDelete={(id) => deleteMutation.mutate(id)}
            isDeleting={deleteMutation.isPending}
          />
        ))}
      </div>

      <DraftConvertDialog
        draft={convertDraft}
        wsId={wsId}
        isOpen={!!convertDraft}
        onClose={() => setConvertDraft(null)}
        onConverted={handleConverted}
      />
    </>
  );
}
