'use client';

import { type ComponentProps, useEffect } from 'react';
import { BoardViews } from '../shared/board-views';
import {
  useInstantBoardSyncController,
  useInstantBoardTasks,
} from './instant-board-sync';
import {
  InstantBoardSyncProvider,
  setActiveInstantBoardSync,
} from './instant-board-sync-context';

type Props = Omit<ComponentProps<typeof BoardViews>, 'tasks'> & {
  boardId: string;
  wsId: string;
};

/**
 * Pilot board renderer (lazy chunk). Reads tasks through a TanStack DB live
 * query and exposes optimistic actions to the board tree and the task dialog.
 */
export default function InstantBoardViews({ boardId, wsId, ...props }: Props) {
  const sync = useInstantBoardSyncController({ boardId, wsId });
  const tasks = useInstantBoardTasks(sync);

  useEffect(() => {
    setActiveInstantBoardSync(sync);
    return () => setActiveInstantBoardSync(null);
  }, [sync]);

  return (
    <InstantBoardSyncProvider value={sync}>
      <BoardViews {...props} tasks={tasks} />
    </InstantBoardSyncProvider>
  );
}
