'use client';

import { BoardShareSettingsPanel } from '@tuturuuu/tasks-ui/tu-do/boards/board-share-settings-panel';
import { Badge } from '@tuturuuu/ui/badge';
import { SettingItemTab } from '@tuturuuu/ui/custom/settings-item-tab';
import { useTranslations } from 'next-intl';

interface TaskShareSettingsProps {
  boardId?: string;
  wsId?: string;
}

export function TaskShareSettings({ boardId, wsId }: TaskShareSettingsProps) {
  const t = useTranslations('settings.tasks');
  const canManageBoardSharing = Boolean(wsId && boardId);

  return (
    <div className="space-y-6">
      <SettingItemTab
        title={t('share')}
        description={
          canManageBoardSharing
            ? t('share_description')
            : t('share_no_board_description')
        }
      >
        {!canManageBoardSharing && (
          <Badge variant="secondary">{t('share_open_board')}</Badge>
        )}
      </SettingItemTab>

      {wsId && boardId && (
        <BoardShareSettingsPanel
          board={{ id: boardId, name: t('board') }}
          wsId={wsId}
        />
      )}
    </div>
  );
}
