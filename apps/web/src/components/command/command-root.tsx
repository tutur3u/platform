'use client';

import { usePlatform } from '@tuturuuu/utils/hooks/use-platform';
import { useEffect } from 'react';
import { BoardNavigation } from './board-navigation';
import { ComingSoonSection } from './coming-soon';
import { EmptyState } from './empty-state';
import { QuickActions } from './quick-actions';

interface CommandRootProps {
  wsId: string;
  inputValue: string;
  setOpen: (open: boolean) => void;
  setPage?: (page: string) => void;
}

export function CommandRoot({
  wsId,
  inputValue,
  setOpen,
  setPage,
}: CommandRootProps) {
  const { modKey } = usePlatform();

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey) {
        if (e.key === '1') {
          e.preventDefault();
          const quickActions = document.querySelector(
            '[data-section="quick-actions"]'
          );
          const button = quickActions?.querySelector('button[data-toggle]');
          (button as HTMLButtonElement)?.click();
        } else if (e.key === '2') {
          e.preventDefault();
          const boardNav = document.querySelector(
            '[data-section="board-navigation"]'
          );
          const button = boardNav?.querySelector('button[data-toggle]');
          (button as HTMLButtonElement)?.click();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Show empty state only when there's a search with no results
  const showEmptyState =
    inputValue.trim() &&
    !document.querySelector('[data-section] .command-item');

  if (showEmptyState) {
    return <EmptyState />;
  }

  return (
    <div className="space-y-0">
      {/* Quick Actions */}
      {!inputValue && (
        <div data-section="quick-actions">
          <QuickActions wsId={wsId} setOpen={setOpen} setPage={setPage} />
        </div>
      )}

      {/* Board Navigation */}
      {!inputValue && (
        <div data-section="board-navigation">
          <BoardNavigation wsId={wsId} setOpen={setOpen} />
        </div>
      )}

      {/* Coming Soon */}
      {!inputValue && (
        <div data-section="coming-soon">
          <ComingSoonSection />
        </div>
      )}

      {/* Help text */}
      {!inputValue && (
        <div className="px-3 py-2 text-center">
          <p className="text-muted-foreground text-xs">
            Use{' '}
            <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-medium font-mono text-[10px] text-muted-foreground opacity-100">
              {modKey}1
            </kbd>{' '}
            and{' '}
            <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-medium font-mono text-[10px] text-muted-foreground opacity-100">
              {modKey}2
            </kbd>{' '}
            to toggle sections
          </p>
        </div>
      )}
    </div>
  );
}
