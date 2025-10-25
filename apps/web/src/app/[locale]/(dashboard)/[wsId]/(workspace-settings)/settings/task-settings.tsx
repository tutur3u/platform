'use client';

import { Switch } from '@tuturuuu/ui/switch';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from '@tuturuuu/ui/sonner';

interface Props {
  wsId: string;
  initialValue?: boolean;
}

export default function TaskSettings({ wsId, initialValue = false }: Props) {
  const t = useTranslations('ws-settings');
  const [autoAssign, setAutoAssign] = useState(initialValue);
  const [isUpdating, setIsUpdating] = useState(false);

  const handleToggle = async (checked: boolean) => {
    setIsUpdating(true);
    try {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/settings/auto_assign_task_creator`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ value: checked.toString() }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to update setting');
      }

      setAutoAssign(checked);
      toast.success(t('task_settings_updated'));
    } catch (error) {
      console.error('Error updating auto-assign setting:', error);
      toast.error(t('task_settings_update_failed'));
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="flex flex-col rounded-lg border border-border bg-foreground/5 p-4">
      <div className="mb-1 font-bold text-2xl">{t('task_settings')}</div>
      <div className="mb-4 font-semibold text-foreground/80">
        {t('task_settings_description')}
      </div>

      <div className="flex items-center justify-between rounded-lg border p-4 transition-colors hover:bg-muted/50">
        <div className="space-y-0.5">
          <p className="font-medium text-sm">{t('auto_assign_task_creator')}</p>
          <p className="text-muted-foreground text-xs">
            {t('auto_assign_task_creator_description')}
          </p>
        </div>
        <Switch
          checked={autoAssign}
          onCheckedChange={handleToggle}
          disabled={isUpdating}
        />
      </div>
    </div>
  );
}
