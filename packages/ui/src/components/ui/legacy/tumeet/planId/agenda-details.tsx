'use client';

import { updatePlan } from '@tuturuuu/apis/tumeet/actions';
import { ClipboardList, Pencil, Plus } from '@tuturuuu/icons';
import type { MeetTogetherPlan } from '@tuturuuu/types/primitives/MeetTogetherPlan';
import type { JSONContent } from '@tuturuuu/types/tiptap';
import { Button } from '@tuturuuu/ui/button';
import { useTimeBlocking } from '@tuturuuu/ui/hooks/time-blocking-provider';
import { RichTextEditor } from '@tuturuuu/ui/text-editor/editor';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';

interface AgendaDetailsProps {
  plan: MeetTogetherPlan;
}

export default function AgendaDetails({ plan }: AgendaDetailsProps) {
  const t = useTranslations('meet-together');
  const router = useRouter();
  const { user } = useTimeBlocking();
  const [editContent, setEditContent] = useState<JSONContent | null>(
    plan.agenda_content || null
  );
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

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
      const result = await updatePlan(plan.id, {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        agenda_content: editContent as any,
      });

      if (result.data) {
        setIsEditing(false);
        router.refresh();
      } else {
        console.error('Failed to save agenda:', result.error);
      }
    } catch (error) {
      console.error('Error saving agenda:', error);
    } finally {
      setIsLoading(false);
    }
  }, [plan.id, editContent, router]);

  const handleContentChange = useCallback((content: JSONContent | null) => {
    setEditContent(content || null);
  }, []);

  // Only allow platform users to edit (not guest users)
  const canEdit = !!user && !user.is_guest;

  return (
    <div className="w-full space-y-8">
      <div className="flex flex-col items-start justify-between gap-4 md:flex-row">
        <div className="space-y-4">
          <p className="font-semibold text-4xl">{t('agenda')}</p>
          <p className="text-md text-muted-foreground">
            {t('agenda_description')}
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
              Cancel
            </Button>
            <Button onClick={handleSave} size="lg" disabled={isLoading}>
              {isLoading ? 'Saving...' : 'Save'}
            </Button>
          </div>
        ) : canEdit ? (
          plan.agenda_content ? (
            <Button onClick={handleEdit} variant="outline" size="lg">
              <Pencil size={16} />
              Edit
            </Button>
          ) : (
            <Button onClick={handleEdit} variant="default" size="lg">
              <Plus size={16} />
              Add Agenda
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
              <h3 className="font-medium text-lg">No Agenda Content Yet</h3>
              <p className="max-w-md text-muted-foreground text-sm">
                Start organizing your meeting by creating a structured outline
                to keep everyone on track to make your meeting more productive.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
