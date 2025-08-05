'use client';

import type { MeetTogetherPlan } from '@tuturuuu/types/primitives/MeetTogetherPlan';
import { Button } from '@tuturuuu/ui/button';
import { useTimeBlocking } from '@tuturuuu/ui/hooks/time-blocking-provider';
import { ClipboardList, Pencil, Plus } from '@tuturuuu/ui/icons';
import { RichTextEditor } from '@tuturuuu/ui/text-editor/editor';
import { type JSONContent } from '@tuturuuu/ui/tiptap';
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
      const data = {
        agenda_content: editContent,
      };

      const res = await fetch(`/api/meet-together/plans/${plan.id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });

      if (res.ok) {
        setIsEditing(false);
        router.refresh();
      } else {
        console.error('Failed to save agenda');
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
          <p className="text-4xl font-semibold">{t('agenda')}</p>
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
              <h3 className="text-lg font-medium">No Agenda Content Yet</h3>
              <p className="max-w-md text-sm text-muted-foreground">
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
