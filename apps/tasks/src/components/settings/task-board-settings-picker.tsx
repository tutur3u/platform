'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowRight, KanbanSquare, Loader2 } from '@tuturuuu/icons';
import { listWorkspaceTaskBoards } from '@tuturuuu/internal-api/tasks';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Combobox } from '@tuturuuu/ui/custom/combobox';
import { SettingItemTab } from '@tuturuuu/ui/custom/settings-item-tab';
import { SettingsSection } from '@tuturuuu/ui/custom/settings-section';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';

function getBrowserInternalApiOptions() {
  return typeof window !== 'undefined'
    ? { baseUrl: window.location.origin }
    : undefined;
}

interface TaskBoardSettingsPickerProps {
  boardId?: string;
  onOpenBoard: (boardId: string) => void;
  wsId: string;
}

export function TaskBoardSettingsPicker({
  boardId,
  onOpenBoard,
  wsId,
}: TaskBoardSettingsPickerProps) {
  const t = useTranslations('settings.tasks');
  const [selectedBoardId, setSelectedBoardId] = useState(boardId ?? '');
  const { data, isLoading } = useQuery({
    queryKey: ['task-settings-board-picker', wsId],
    queryFn: () =>
      listWorkspaceTaskBoards(
        wsId,
        { pageSize: 100, status: 'active' },
        getBrowserInternalApiOptions()
      ),
    staleTime: 30_000,
  });

  useEffect(() => {
    setSelectedBoardId(boardId ?? '');
  }, [boardId]);

  const boards = data?.boards.filter((board) => !board.deleted_at) ?? [];
  const options = useMemo(
    () =>
      boards.map((board) => ({
        value: board.id,
        label: board.name || t('untitled_board'),
        description: board.ticket_prefix || undefined,
        icon: <KanbanSquare className="size-4" />,
      })),
    [boards, t]
  );
  const selectedBoard = boards.find((board) => board.id === selectedBoardId);
  const isEmpty = !isLoading && boards.length === 0;

  return (
    <SettingsSection>
      <SettingItemTab
        layout="stacked"
        description={t('board_picker_description')}
        title={
          <>
            {t('board_picker_title')}
            <Badge className="shrink-0" variant="secondary">
              {boards.length}
            </Badge>
          </>
        }
      >
        <div className="flex flex-col gap-2 sm:flex-row">
          <Combobox
            ariaLabel={t('board_picker_placeholder')}
            className="min-w-0 flex-1"
            disabled={isLoading || isEmpty}
            emptyText={t('board_picker_empty')}
            onChange={(value) =>
              setSelectedBoardId(typeof value === 'string' ? value : '')
            }
            options={options}
            placeholder={
              isLoading
                ? t('board_picker_loading')
                : t('board_picker_placeholder')
            }
            searchPlaceholder={t('board_picker_search')}
            selected={selectedBoardId}
          />
          <Button
            className="gap-2 sm:shrink-0"
            disabled={!selectedBoard}
            onClick={() => selectedBoard && onOpenBoard(selectedBoard.id)}
            type="button"
          >
            {isLoading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <ArrowRight className="size-4" />
            )}
            {t('board_picker_open')}
          </Button>
        </div>
      </SettingItemTab>
    </SettingsSection>
  );
}
