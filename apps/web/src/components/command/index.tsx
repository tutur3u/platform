'use client';

import { AddTaskForm } from './add-task-form';
import { CommandHeader } from './command-header';
import './command-palette.css';
import { useQuery } from '@tanstack/react-query';
import { CommandDialog, CommandList } from '@tuturuuu/ui/command';
import { useParams, useRouter } from 'next/navigation';
import * as React from 'react';
import { CommandRoot } from './command-root';
import { EmptyState } from './empty-state';
import { QuickTimeTracker } from './quick-time-tracker';

// Main Command Palette Component
export function CommandPalette({
  open,
  setOpen,
}: {
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  const [page, setPage] = React.useState('root');
  const [inputValue, setInputValue] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(false);
  const [isTransitioning, setIsTransitioning] = React.useState(false);

  const params = useParams();
  const router = useRouter();
  const { wsId } = params;

  // Only fetch boards when on root page and command palette is open - optimized data fetching
  const { data: boardsData } = useQuery({
    queryKey: ['boards-navigation', wsId],
    queryFn: async () => {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/boards-with-lists`
      );
      if (!response.ok) throw new Error('Failed to fetch boards');
      return response.json();
    },
    enabled: !!wsId && open && page === 'root', // Only fetch when needed
  });

  const boards = boardsData?.boards || [];

  // Reset state when modal closes
  React.useEffect(() => {
    if (!open) {
      const timeout = setTimeout(() => {
        setPage('root');
        setInputValue('');
        setIsTransitioning(false);
      }, 200);
      return () => clearTimeout(timeout);
    }
  }, [open]);

  // Enhanced keyboard event handling
  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      // Command+K to toggle
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        // Check if user is typing in an input field
        const activeElement = document.activeElement;
        if (
          activeElement instanceof HTMLInputElement ||
          activeElement instanceof HTMLTextAreaElement ||
          activeElement?.getAttribute('contenteditable') === 'true'
        ) {
          return;
        }

        e.preventDefault();
        e.stopPropagation();
        setOpen((currentOpen) => !currentOpen);
        return;
      }

      // Enhanced Escape key behavior - fixed to properly detect search input focus
      if (e.key === 'Escape' && open) {
        e.preventDefault();
        e.stopPropagation();

        // Check if the command input is focused and has value
        const commandInput = document.querySelector(
          '[cmdk-input]'
        ) as HTMLInputElement;
        const isCommandInputFocused =
          commandInput && document.activeElement === commandInput;

        // If search input is focused and has value, clear it first
        if (isCommandInputFocused && inputValue.trim()) {
          setInputValue('');
          return;
        }

        // If not on root page, go back to root
        if (page !== 'root') {
          handleBack();
          return;
        }

        // If on root with no input, close the modal
        setOpen(false);
        return;
      }
    };

    document.addEventListener('keydown', down, { capture: true });
    return () =>
      document.removeEventListener('keydown', down, { capture: true });
  }, [setOpen, page, open, inputValue, handleBack]);

  // Navigation handlers
  const handleBack = React.useCallback(() => {
    setIsTransitioning(true);
    setInputValue('');
    setTimeout(() => {
      setPage('root');
      setIsTransitioning(false);
    }, 150);
  }, []);

  const handlePageChange = React.useCallback((newPage: string) => {
    setIsTransitioning(true);
    setTimeout(() => {
      setPage(newPage);
      setInputValue('');
      setIsTransitioning(false);
    }, 150);
  }, []);

  const handleBoardNavigation = React.useCallback(
    (boardId: string) => {
      router.push(`/${wsId}/tasks/boards/${boardId}`);
      setOpen(false);
    },
    [router, wsId, setOpen]
  );

  const handleCalendarNavigation = React.useCallback(() => {
    router.push(`/${wsId}/calendar`);
    setOpen(false);
  }, [router, wsId, setOpen]);

  const handleTimeTrackerNavigation = React.useCallback(() => {
    router.push(`/${wsId}/time-tracker`);
    setOpen(false);
  }, [router, wsId, setOpen]);

  const handleQuickTimeTrackerNavigation = React.useCallback(() => {
    handlePageChange('time-tracker');
  }, [handlePageChange]);

  return (
    <CommandDialog open={open} onOpenChange={setOpen} showXIcon={false}>
      <CommandHeader
        page={page}
        inputValue={inputValue}
        setInputValue={setInputValue}
        isLoading={isLoading}
        isTransitioning={isTransitioning}
        onBack={handleBack}
        shouldAutoFocus={page !== 'time-tracker'}
      />

      <CommandList
        className={`${isTransitioning ? 'opacity-50 transition-opacity' : ''} max-h-[400px]`}
      >
        {page === 'root' && <EmptyState />}

        {page === 'root' && !isTransitioning && (
          <CommandRoot
            boards={boards}
            inputValue={inputValue}
            onAddTask={() => handlePageChange('add-task')}
            onTimeTracker={handleTimeTrackerNavigation}
            onQuickTimeTracker={handleQuickTimeTrackerNavigation}
            onCalendar={handleCalendarNavigation}
            onBoardSelect={handleBoardNavigation}
          />
        )}

        {page === 'add-task' && !isTransitioning && (
          <div className="command-page-enter">
            <AddTaskForm
              wsId={wsId as string}
              setOpen={setOpen}
              setIsLoading={setIsLoading}
              inputValue={inputValue}
              setInputValue={setInputValue}
            />
          </div>
        )}

        {page === 'time-tracker' && !isTransitioning && (
          <div className="command-page-enter">
            <QuickTimeTracker
              wsId={wsId as string}
              setOpen={setOpen}
              setIsLoading={setIsLoading}
            />
          </div>
        )}
      </CommandList>
    </CommandDialog>
  );
}
