'use client';

import { useQueryClient } from '@tanstack/react-query';
import { getWorkspaceTaskBoard } from '@tuturuuu/internal-api/tasks';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

const BOARD_SETTINGS_PRELOAD_EVENT = 'tuturuuu:board-settings-intent';
const SETTINGS_DIALOG_OPEN_INTENT_EVENT =
  'tuturuuu:settings-dialog-open-intent';

function getBrowserInternalApiOptions() {
  return typeof window !== 'undefined'
    ? { baseUrl: window.location.origin }
    : undefined;
}

/**
 * Opens the board's settings in the canonical settings dialog. A mounted
 * dialog can claim the intent event; otherwise the URL fallback opens it.
 */
export function useOpenBoardSettings({
  boardId,
  enabled = true,
  onBoardSettingsIntent,
  workspaceId,
}: {
  boardId: string;
  enabled?: boolean;
  onBoardSettingsIntent?: () => void;
  workspaceId: string;
}) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function prefetchBoardSettings() {
    if (!enabled) return;

    onBoardSettingsIntent?.();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event(BOARD_SETTINGS_PRELOAD_EVENT));
    }

    void queryClient.prefetchQuery({
      queryKey: ['task-board-settings', workspaceId, boardId],
      queryFn: async () => {
        const payload = await getWorkspaceTaskBoard(
          workspaceId,
          boardId,
          getBrowserInternalApiOptions()
        );
        return payload.board;
      },
      staleTime: 30_000,
    });
  }

  function openBoardSettings() {
    prefetchBoardSettings();

    const openIntent = new CustomEvent(SETTINGS_DIALOG_OPEN_INTENT_EVENT, {
      cancelable: true,
      detail: { settingsBoardId: boardId, settingsTab: 'task_board' },
    });
    window.dispatchEvent(openIntent);

    if (openIntent.defaultPrevented) return;

    const params = new URLSearchParams(searchParams.toString());
    params.set('settingsDialog', 'open');
    params.set('settingsTab', 'task_board');
    params.set('settingsBoardId', boardId);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return { openBoardSettings, prefetchBoardSettings };
}
