'use client';

import type { BoardSprintLengthWeeks } from '@tuturuuu/internal-api/task-sprints';
import { ToggleGroup, ToggleGroupItem } from '@tuturuuu/ui/toggle-group';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import {
  useBoardSprintMutations,
  useBoardSprints,
} from '../shared/board-sprints/use-board-sprints';
import { SettingsGroup, SettingsRow } from '../shared/settings-group';

const OPTIONS = ['off', '1', '2'] as const;

/** Board settings row: turn sprints off or pick a one or two week length. */
export function BoardSprintSettings({
  boardId,
  wsId,
}: {
  boardId: string;
  wsId: string;
}) {
  const t = useTranslations('ws-task-boards.sprints');
  const sprints = useBoardSprints({ boardId, wsId });
  const { setLength } = useBoardSprintMutations({ boardId, wsId });
  const value =
    sprints.sprintLengthWeeks === null
      ? 'off'
      : String(sprints.sprintLengthWeeks);

  // Hidden until the sprint migration has reached this database.
  if (sprints.isLoading || sprints.isError || !sprints.schemaAvailable) {
    return null;
  }

  const handleChange = (next: string) => {
    if (!next || next === value) return;
    const weeks =
      next === 'off' ? null : (Number(next) as BoardSprintLengthWeeks);
    setLength.mutate(weeks, {
      onSuccess: (data) => {
        if (!data.schemaAvailable) {
          toast.error(t('unavailable'));
          return;
        }
        toast.success(weeks === null ? t('turned_off') : t('length_saved'));
      },
      onError: () => toast.error(t('length_failed')),
    });
  };

  return (
    <SettingsGroup title={t('settings_title')}>
      <SettingsRow
        description={t('settings_description')}
        label={t('sprint_length')}
      >
        <ToggleGroup
          aria-label={t('sprint_length')}
          disabled={setLength.isPending}
          onValueChange={handleChange}
          type="single"
          value={value}
          variant="outline"
        >
          {OPTIONS.map((option) => (
            <ToggleGroupItem key={option} className="px-3" value={option}>
              {option === 'off'
                ? t('off')
                : t('weeks', { count: Number(option) })}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </SettingsRow>
    </SettingsGroup>
  );
}
