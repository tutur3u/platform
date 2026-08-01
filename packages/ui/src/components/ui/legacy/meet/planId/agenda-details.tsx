'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ClipboardList, Pencil, Plus } from '@tuturuuu/icons';
import { type MeetPlanSnapshot, updateMeetPlan } from '@tuturuuu/internal-api';
import type { MeetTogetherPlan } from '@tuturuuu/types/primitives/MeetTogetherPlan';
import type { JSONContent } from '@tuturuuu/types/tiptap';
import { Button } from '@tuturuuu/ui/button';
import { useTimeBlocking } from '@tuturuuu/ui/hooks/time-blocking-provider';
import { RichTextEditor } from '@tuturuuu/ui/text-editor/editor';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';

interface AgendaDetailsProps {
  plan: MeetTogetherPlan;
}

export default function AgendaDetails({ plan }: AgendaDetailsProps) {
  const t = useTranslations();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useTimeBlocking();
  const [editContent, setEditContent] = useState<JSONContent | null>(
    plan.agenda_content || null
  );
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const mutation = useMutation({
    mutationFn: (agendaContent: JSONContent | null) =>
      updateMeetPlan(plan.id!, { agenda_content: agendaContent }),
    onMutate: async (agendaContent) => {
      if (!plan.id) return {};
      const queryKey = ['meet-plan', plan.id] as const;
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<MeetPlanSnapshot>(queryKey);
      if (previous)
        queryClient.setQueryData<MeetPlanSnapshot>(queryKey, {
          ...previous,
          plan: {
            ...previous.plan,
            agenda_content: agendaContent ?? undefined,
          },
        });
      return { previous };
    },
    onError: (_error, _agenda, context) => {
      if (plan.id && context?.previous)
        queryClient.setQueryData(['meet-plan', plan.id], context.previous);
    },
    onSuccess: (snapshot) => {
      if (plan.id) queryClient.setQueryData(['meet-plan', plan.id], snapshot);
    },
  });

  const handleEdit = useCallback(() => {
    setIsEditing(true);
    setEditContent(plan.agenda_content || null);
  }, [plan.agenda_content]);

  const handleCancel = useCallback(() => {
    setIsEditing(false);
    setEditContent(plan.agenda_content || null);
  }, [plan.agenda_content]);

  const handleSave = useCallback(async () => {
    if (!plan.id) return;

    setIsLoading(true);
    try {
      await mutation.mutateAsync(editContent);
      setIsEditing(false);
      router.refresh();
    } catch (error) {
      console.error('Error saving agenda:', error);
    } finally {
      setIsLoading(false);
    }
  }, [editContent, mutation, plan.id, router]);

  const handleContentChange = useCallback((content: JSONContent | null) => {
    setEditContent(content || null);
  }, []);

  // Only allow platform users to edit (not guest users)
  const canEdit = !!user && !user.is_guest;

  return (
    <div className="w-full space-y-8">
      <div className="flex flex-col items-start justify-between gap-4 md:flex-row">
        <div className="space-y-4">
          <p className="font-semibold text-4xl">{t('meet-together.agenda')}</p>
          <p className="text-md text-muted-foreground">
            {t('meet-together.agenda_description')}
          </p>
        </div>
        {isEditing ? (
          <div className="flex justify-center gap-2">
            <Button
              onClick={handleCancel}
              variant="outline"
              size="lg"
              disabled={isLoading}
            >
              {t('common.cancel')}
            </Button>
            <Button onClick={handleSave} size="lg" disabled={isLoading}>
              {isLoading
                ? t('meet-together-plan-details.saving')
                : t('common.save')}
            </Button>
          </div>
        ) : canEdit ? (
          plan.agenda_content ? (
            <Button onClick={handleEdit} variant="outline" size="lg">
              <Pencil size={16} />
              {t('common.edit')}
            </Button>
          ) : (
            <Button onClick={handleEdit} variant="default" size="lg">
              <Plus size={16} />
              {t('meet-together-plan-details.add_agenda')}
            </Button>
          )
        ) : null}
      </div>

      {plan.agenda_content || isEditing ? (
        <RichTextEditor
          content={isEditing ? editContent : plan.agenda_content || null}
          onChange={isEditing ? handleContentChange : undefined}
          readOnly={!isEditing}
          className="max-h-screen w-full"
        />
      ) : (
        <div className="flex h-96 w-full items-center justify-center">
          <div className="flex flex-col items-center space-y-4 text-center">
            <div className="rounded-full bg-muted p-6">
              <ClipboardList size={48} className="text-muted-foreground" />
            </div>
            <div className="space-y-2">
              <h3 className="font-medium text-lg">
                {t('meet-together-plan-details.no_agenda_title')}
              </h3>
              <p className="max-w-md text-muted-foreground text-sm">
                {t('meet-together-plan-details.no_agenda_description')}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
