'use client';

import { BoardNavigation } from './board-navigation';
import { ComingSoonSection } from './coming-soon';
import { QuickActions } from './quick-actions';
import type { Board } from './types';

interface CommandRootProps {
  boards: any[];
  inputValue: string;
  isLoading?: boolean;
  error?: Error | null;
  onAddTask: () => void;
  onTimeTracker: () => void;
  onQuickTimeTracker: () => void;
  onCalendar: () => void;
  onBoardSelect: (boardId: string) => void;
}

export function CommandRoot({
  boards,
  inputValue,
  isLoading,
  error,
  onAddTask,
  onTimeTracker,
  onQuickTimeTracker,
  onCalendar,
  onBoardSelect,
}: CommandRootProps) {
  return (
    <div className="command-page-enter">
      <QuickActions
        onAddTask={onAddTask}
        onTimeTracker={onTimeTracker}
        onQuickTimeTracker={onQuickTimeTracker}
        onCalendar={onCalendar}
      />
      <BoardNavigation
        boards={boards}
        inputValue={inputValue}
        isLoading={isLoading}
        error={error}
        onBoardSelect={onBoardSelect}
      />
      {!inputValue && <ComingSoonSection />}
    </div>
  );
}
