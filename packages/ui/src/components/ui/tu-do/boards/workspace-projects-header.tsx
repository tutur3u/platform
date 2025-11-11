'use client';

import type { Workspace } from '@tuturuuu/types';
import { Plus } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { EnhancedBoardsView } from './enhanced-boards-view';
import { TaskBoardForm } from './form';

interface WorkspaceProjectsHeaderProps {
  isPersonal: boolean;
  personalWorkspaceId?: string;
  defaultWsId?: string;
  wsId: string;
  wsIds?: string[];
  workspaces?: Workspace[];
}

export function WorkspaceProjectsHeader({
  isPersonal,
  personalWorkspaceId,
  defaultWsId,
  wsId,
  wsIds,
  workspaces,
}: WorkspaceProjectsHeaderProps) {
  const t = useTranslations();
  const [selectedWsId, setSelectedWsId] = useState<string | null>(
    isPersonal ? (personalWorkspaceId ?? null) : (defaultWsId ?? null)
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <h1 className="font-bold text-2xl tracking-tight">
            {t('ws-task-boards.plural')}
          </h1>
          <p className="text-muted-foreground">
            {t('ws-task-boards.description')}
          </p>
        </div>
        <TaskBoardForm
          wsId={
            selectedWsId ?? (isPersonal ? personalWorkspaceId : defaultWsId) ?? wsId
          }
        >
          <Button className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            {t('ws-task-boards.create')}
          </Button>
        </TaskBoardForm>
      </div>

      <EnhancedBoardsView
        wsId={wsId}
        wsIds={wsIds}
        isPersonal={isPersonal}
        workspaces={workspaces}
        onSelectedWorkspaceChange={setSelectedWsId}
      />
    </div>
  );
}
